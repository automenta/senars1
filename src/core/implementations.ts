import { VectorDB, PatternMatcher, IAttentionPolicy, ITruthPolicy, IResonanceStrategy, ICognitiveSchema, ProcedureHandler, TriggerPattern, MatchResult } from './interfaces';
import { UUID, Vector, TaskType } from './types';
import { generate_embedding } from './utils';
import { Task, AttentionValue, TruthValue, SemanticAtom, DerivationStamp } from './models';
import { WorldModel } from './world-model';
import { parseSExpression, sExpressionToString, SExpression } from './s-expression';
import { extract_param } from './procedure';
import { ChatOpenAI } from "@langchain/openai";

// Helper to generate a UUID (placeholder)
function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
}

// Helper for cosine similarity
function dotProduct(vec1: Vector, vec2: Vector): number {
  return vec1.reduce((sum, val, i) => sum + val * (vec2[i] || 0), 0);
}

function magnitude(vec: Vector): number {
  return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}

function cosineSimilarity(vec1: Vector, vec2: Vector): number {
  const mag1 = magnitude(vec1);
  const mag2 = magnitude(vec2);
  if (mag1 === 0 || mag2 === 0) return 0; // Avoid division by zero
  return dotProduct(vec1, vec2) / (mag1 * mag2);
}

export class InMemoryVectorDB implements VectorDB {
  private embeddings: Record<UUID, Vector> = {};

  add(embedding: Vector, atom_id: UUID): void {
    this.embeddings[atom_id] = embedding;
  }

  find_nearest(embedding: Vector, k: number): UUID[] {
    if (Object.keys(this.embeddings).length === 0) return [];

    const similarities: { id: UUID; similarity: number }[] = [];
    for (const atom_id in this.embeddings) {
      const storedEmbedding = this.embeddings[atom_id];
      const similarity = cosineSimilarity(embedding, storedEmbedding);
      similarities.push({ id: atom_id, similarity });
    }

    similarities.sort((a, b) => b.similarity - a.similarity); // Sort descending
    return similarities.slice(0, k).map((s) => s.id);
  }

  remove(atom_id: UUID): void {
    delete this.embeddings[atom_id];
  }
}

// Helper for S-Expression pattern matching with variables
export function matchSExpressionPattern(
  patternSExpr: SExpression | string,
  contentSExpr: SExpression | string,
  bindings: Record<string, string>
): boolean {
  if (typeof patternSExpr === 'string') {
    if (patternSExpr.startsWith('$') || patternSExpr.startsWith('%')) {
      // It's a variable, bind it
      const varName = patternSExpr;
      if (bindings[varName] && bindings[varName] !== sExpressionToString(contentSExpr)) {
        return false; // Variable already bound to a different value
      }
      bindings[varName] = sExpressionToString(contentSExpr);
      return true;
    } else {
      // Literal match
      return patternSExpr === contentSExpr;
    }
  } else if (typeof contentSExpr === 'string') {
    // If the pattern is an S-expression but the content is a string, they can't match...
    // UNLESS the pattern is a single variable, like ($P)
    if (patternSExpr.args.length === 0 && patternSExpr.head.startsWith('$')) {
        const varName = patternSExpr.head;
        if (bindings[varName] && bindings[varName] !== contentSExpr) {
            return false;
        }
        bindings[varName] = contentSExpr;
        return true;
    }
    return false;
  } else {
    // Both are S-Expressions
    if (patternSExpr.head.startsWith('$')) {
        const varName = patternSExpr.head;
        if (bindings[varName] && bindings[varName] !== sExpressionToString(contentSExpr)) {
            return false; // Variable already bound to a different value
        }
        bindings[varName] = sExpressionToString(contentSExpr);
        return true; // The entire S-expression is bound to the head variable
    }

    if (patternSExpr.head !== contentSExpr.head) {
      return false;
    }
    if (patternSExpr.args.length !== contentSExpr.args.length) {
      return false;
    }
    for (let i = 0; i < patternSExpr.args.length; i++) {
      if (!matchSExpressionPattern(patternSExpr.args[i], contentSExpr.args[i], bindings)) {
        return false;
      }
    }
    return true;
  }
}

export class InMemoryPatternMatcher implements PatternMatcher {
    private single_premise_patterns: Map<string, UUID[]> = new Map();
    private dual_premise_patterns: Map<string, UUID[]> = new Map();

    add(pattern: TriggerPattern, schema_id: UUID): void {
        const key = JSON.stringify(pattern);
        console.log(`[InMemoryPatternMatcher.add] Registering pattern for schema ${schema_id}: ${key}`);
        if (typeof pattern === 'string') {
            if (!this.single_premise_patterns.has(key)) {
                this.single_premise_patterns.set(key, []);
            }
            this.single_premise_patterns.get(key)!.push(schema_id);
        } else {
            if (!this.dual_premise_patterns.has(key)) {
                this.dual_premise_patterns.set(key, []);
            }
            this.dual_premise_patterns.get(key)!.push(schema_id);
        }
    }

    remove(pattern: TriggerPattern, schema_id: UUID): void {
        const key = JSON.stringify(pattern);
        const map = typeof pattern === 'string' ? this.single_premise_patterns : this.dual_premise_patterns;
        if (map.has(key)) {
            const schema_ids = map.get(key)!;
            const index = schema_ids.indexOf(schema_id);
            if (index > -1) {
                schema_ids.splice(index, 1);
            }
            if (schema_ids.length === 0) {
                map.delete(key);
            }
        }
    }

    has(pattern: TriggerPattern, schema_id: UUID): boolean {
        const key = JSON.stringify(pattern);
        const map = typeof pattern === 'string' ? this.single_premise_patterns : this.dual_premise_patterns;
        if (!map.has(key)) {
            return false;
        }
        const schema_ids = map.get(key)!;
        return schema_ids.includes(schema_id);
    }

    match_dual(content_a: string, content_b: string): MatchResult[] {
        const results: MatchResult[] = [];
        let contentA_SExpr, contentB_SExpr;

        try {
            contentA_SExpr = parseSExpression(content_a);
            contentB_SExpr = parseSExpression(content_b);
        } catch (e) {
            return [];
        }

        for (const [patternKey, schema_ids] of this.dual_premise_patterns.entries()) {
            try {
                const pattern = JSON.parse(patternKey) as [string, string];
                const patternA = parseSExpression(pattern[0]);
                const patternB = parseSExpression(pattern[1]);

                const bindings1: Record<string, string> = {};
                if (matchSExpressionPattern(patternA, contentA_SExpr, bindings1) && matchSExpressionPattern(patternB, contentB_SExpr, bindings1)) {
                    for (const schema_id of schema_ids) {
                        results.push({ schema_id, bindings: { ...bindings1 } });
                    }
                }

                const bindings2: Record<string, string> = {};
                if (matchSExpressionPattern(patternA, contentB_SExpr, bindings2) && matchSExpressionPattern(patternB, contentA_SExpr, bindings2)) {
                    for (const schema_id of schema_ids) {
                        results.push({ schema_id, bindings: { ...bindings2 } });
                    }
                }
            } catch (e) {
                console.warn(`Skipping invalid dual-premise schema pattern: ${patternKey}`, e);
                continue;
            }
        }

        return results;
    }

    match_single(content: string): MatchResult[] {
        const results: MatchResult[] = [];
        let contentSExpr;

        try {
            contentSExpr = parseSExpression(content);
        } catch (e) {
            return [];
        }

        for (const [patternKey, schema_ids] of this.single_premise_patterns.entries()) {
            try {
                const pattern = JSON.parse(patternKey) as string;
                const patternSExpr = parseSExpression(pattern);

                const bindings: Record<string, string> = {};
                if (matchSExpressionPattern(patternSExpr, contentSExpr, bindings)) {
                    for (const schema_id of schema_ids) {
                        results.push({ schema_id, bindings: { ...bindings } });
                    }
                }
            } catch (e) {
                console.warn(`Skipping invalid single-premise schema pattern: ${patternKey}`, e);
                continue;
            }
        }

        return results;
    }
}

export class DefaultAttentionPolicy implements IAttentionPolicy {
  calculate_initial(task: Task): AttentionValue {
    // Initial tasks get a moderate priority and durability
    return { priority: 0.7, durability: 0.8 };
  }

  calculate_derived(task_a: Task, task_b: Task, schema_id: UUID): AttentionValue {
    // Derived tasks inherit and potentially boost attention from parents
    const avgPriority = (task_a.attention.priority + task_b.attention.priority) / 2;
    const avgDurability = (task_a.attention.durability + task_b.attention.durability) / 2;
    return { 
      priority: Math.min(1.0, avgPriority * 1.1), // Slightly boost priority
      durability: Math.min(1.0, avgDurability * 1.05) // Slightly boost durability
    };
  }

  decay(task: Task, elapsed: number): AttentionValue {
    const decayRate = 0.001; // Example decay rate per second
    const newPriority = Math.max(0.01, task.attention.priority - elapsed * decayRate);
    const newDurability = Math.max(0.01, task.attention.durability - elapsed * decayRate / 2);
    return { priority: newPriority, durability: newDurability };
  }
}

export class DefaultTruthPolicy implements ITruthPolicy {
  revision(belief_a: Task, belief_b: Task): TruthValue {
    // Simple weighted average based on confidence
    const totalConfidence = belief_a.truth!.confidence + belief_b.truth!.confidence;
    if (totalConfidence === 0) return { frequency: 0, confidence: 0 };

    const newFrequency = (
      belief_a.truth!.frequency * belief_a.truth!.confidence +
      belief_b.truth!.frequency * belief_b.truth!.confidence
    ) / totalConfidence;
    const newConfidence = Math.min(1.0, totalConfidence * 0.8); // Confidence can grow but with diminishing returns
    return { frequency: newFrequency, confidence: newConfidence };
  }

  derivation(premise_a: Task, premise_b: Task, schema_id: UUID): TruthValue {
    // Truth of derived conclusion is product of premises' frequencies and confidences
    const freqA = premise_a.truth?.frequency ?? 1.0;
    const confA = premise_a.truth?.confidence ?? 1.0;
    const freqB = premise_b.truth?.frequency ?? 1.0;
    const confB = premise_b.truth?.confidence ?? 1.0;

    const newFrequency = freqA * freqB;
    const newConfidence = confA * confB * 0.9; // Slight confidence loss in derivation
    return { frequency: newFrequency, confidence: newConfidence };
  }
}

export class DefaultResonanceStrategy implements IResonanceStrategy {
  find_context(
    focus: Task,
    world_model: WorldModel,
    k: number,
    scope_bindings?: Record<string, string>
  ): Task[] {
    // For debugging and to ensure schemas can fire, we are temporarily returning all other tasks.
    // This is inefficient but necessary to validate the rest of the reasoning pipeline.
    // A more sophisticated resonance strategy would be needed for a production system.
    return Object.values(world_model.tasks).filter(task => task.id !== focus.id);
  }
}

import { LLMConfig } from './config';
import { App } from '../app';

export class LLMHandler implements ProcedureHandler {
  private config: LLMConfig;
  private llm?: ChatOpenAI;
  private app: App;

  constructor(config: LLMConfig, app: App) {
    this.config = config;
    this.app = app;
    this.update_config(config);
  }

  public update_config(config: LLMConfig) {
    this.config = config;
    if (this.config.apiKey && this.config.modelName) {
        this.llm = new ChatOpenAI({
            apiKey: this.config.apiKey,
            modelName: this.config.modelName,
            temperature: 0.7,
            maxTokens: this.config.max_tokens,
        });
        console.log("LLMHandler configured with new settings.");
    } else {
        this.llm = undefined;
        console.warn("LLMHandler is not fully configured. API key or model name is missing.");
    }
  }

  name(): string {
    return "llm";
  }

  can_handle(content: string): boolean {
    return content.includes('(execute "llm"');
  }

  async execute(
    content: string,
    bindings: Record<string, string>,
    world_model: WorldModel
  ): Promise<Task[]> {
    if (!this.llm || !this.config) {
      console.warn("LLMHandler is not configured. Returning empty result.");
      return this.create_error_task("LLM handler not configured.", world_model);
    }

    let query = extract_param(content, "query");
    if (!query) {
      return this.create_error_task("Query parameter missing from LLM execution.", world_model);
    }

    // Substitute bindings into query
    for (const key in bindings) {
        const placeholder = new RegExp(key.replace('%', '\\%'), 'g');
        query = query.replace(placeholder, bindings[key]);
    }

    try {
        const response = await this.llm.invoke(query);
        const result_text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

        const atom_content = `(search_result "${query}" "${result_text}")`;
        const atom: SemanticAtom = {
            id: generate_uuid(),
            content: atom_content,
            embedding: generate_embedding(atom_content),
        };
        world_model.add_atom(atom);

        return [
            {
                id: generate_uuid(),
                atom_id: atom.id,
                type: TaskType.BELIEF,
                truth: {
                    frequency: 0.9,
                    confidence: 0.9, // High confidence for direct LLM results
                },
                attention: {
                    priority: 0.8,
                    durability: 0.7,
                },
                stamp: {
                    timestamp: Date.now() / 1000,
                    parent_ids: [],
                    schema_id: generate_uuid("llm_handler"),
                },
            },
        ];
    } catch (error: any) {
        console.error("Error executing LLM query:", error);
        return this.create_error_task(`LLM API Error: ${error.message}`, world_model);
    }
  }

  private create_error_task(error_message: string, world_model: WorldModel): Task[] {
      const error_atom: SemanticAtom = {
          id: generate_uuid(),
          content: `(execution_error "llm" "${error_message}")`,
          embedding: generate_embedding(error_message)
      };
      world_model.add_atom(error_atom);

      return [{
          id: generate_uuid(),
          atom_id: error_atom.id,
          type: TaskType.BELIEF,
          truth: { frequency: 1.0, confidence: 1.0 },
          attention: { priority: 0.95, durability: 0.9 },
          stamp: {
              timestamp: Date.now() / 1000,
              parent_ids: [],
              schema_id: generate_uuid("error_handler")
          }
      }];
  }
}

export class QuestionGeneratorHandler implements ProcedureHandler {
    private app: App;
    private llm: LLMHandler;

    constructor(app: App, llm: LLMHandler) {
        this.app = app;
        this.llm = llm;
    }

    name(): string {
        return "question_generator";
    }

    can_handle(content: string): boolean {
        return content.includes('(execute "question_generator"');
    }

    async execute(
        content: string,
        bindings: Record<string, string>,
        world_model: WorldModel
    ): Promise<Task[]> {
        const for_thought = extract_param(content, "for_thought");
        if (!for_thought) {
            console.warn("QuestionGeneratorHandler: for_thought parameter not found.");
            return [];
        }

        const query = `Given the statement "${for_thought}", what is a good follow-up question to expand on this thought?`;

        // We'll use the LLM handler to ask the question.
        // The result of the LLM handler is a BELIEF task. We need to get the content of that belief.
        const llm_tasks = await this.llm.execute(`(execute "llm" query:"${query}")`, bindings, world_model);

        if (llm_tasks.length > 0) {
            const result_atom = world_model.get_atom(llm_tasks[0].atom_id);
            const result_text = extract_param(result_atom.content, `"${query}"`);
            if (result_text) {
                this.app.emit('suggestion_generated', { question: result_text });
            }
        }

        return [];
    }
}
