import { VectorDB, PatternMatcher, IAttentionPolicy, ITruthPolicy, IResonanceStrategy, ICognitiveSchema, ProcedureHandler } from './interfaces';
import { UUID, Vector, TaskType } from './types';
import { generate_embedding } from './utils';
import { Task, AttentionValue, TruthValue, SemanticAtom, DerivationStamp } from './models';
import { WorldModel } from './world-model';
import { parseSExpression, sExpressionToString, SExpression } from './s-expression';
import { extract_param } from './procedure';

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
}

// Helper for S-Expression pattern matching with variables
export function matchSExpressionPattern(
  patternSExpr: SExpression | string,
  contentSExpr: SExpression | string,
  bindings: Record<string, string>
): boolean {
  if (typeof patternSExpr === 'string') {
    if (patternSExpr.startsWith('$')) {
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
    return false; // Cannot match S-Expression pattern with a string content
  } else {
    // Both are S-Expressions
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
  private patterns: Record<string, UUID[]> = {};

  add(pattern: string, schema_id: UUID): void {
    if (!this.patterns[pattern]) {
      this.patterns[pattern] = [];
    }
    this.patterns[pattern].push(schema_id);
  }

  match(content_a: string, content_b: string): UUID[] {
    const matchedSchemaIds: UUID[] = [];
    const contentA_SExpr = parseSExpression(content_a);
    const contentB_SExpr = parseSExpression(content_b);

    for (const patternStr in this.patterns) {
      try {
        const patternSExpr = parseSExpression(patternStr);
        const bindings: Record<string, string> = {};

        // Try matching pattern with content_a and content_b
        if (matchSExpressionPattern(patternSExpr, contentA_SExpr, bindings) ||
            matchSExpressionPattern(patternSExpr, contentB_SExpr, bindings)) {
          matchedSchemaIds.push(...this.patterns[patternStr]);
        }
      } catch (e) {
        console.warn(`Error parsing pattern S-Expression '${patternStr}':`, e);
      }
    }
    return matchedSchemaIds;
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
    // For now, a simple approach: find tasks with similar semantic embeddings
    // and also tasks that share symbolic content (S-expressions).
    const focusAtom = world_model.get_atom(focus.atom_id);
    const relevantAtomIds = world_model.semantic_index.find_nearest(focusAtom.embedding, k * 2); // Get more to filter later

    const contextTasks: Task[] = [];
    const addedTaskIds = new Set<UUID>();

    for (const atomId of relevantAtomIds) {
      // Find tasks associated with this atom
      for (const task of Object.values(world_model.tasks)) {
        if (task.atom_id === atomId && task.id !== focus.id && !addedTaskIds.has(task.id)) {
          contextTasks.push(task);
          addedTaskIds.add(task.id);
          if (contextTasks.length >= k) return contextTasks;
        }
      }
    }

    // Also consider tasks that have similar symbolic content (e.g., same head of S-expression)
    try {
      const focusSExpr = parseSExpression(focusAtom.content);
      for (const content in world_model.symbolic_index) {
        if (content === focusAtom.content) continue; // Don't match with self
        const contentSExpr = parseSExpression(content);
        if (focusSExpr.head === contentSExpr.head) {
          for (const atomId of world_model.symbolic_index[content]) {
            for (const task of Object.values(world_model.tasks)) {
              if (task.atom_id === atomId && task.id !== focus.id && !addedTaskIds.has(task.id)) {
                contextTasks.push(task);
                addedTaskIds.add(task.id);
                if (contextTasks.length >= k) return contextTasks;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Error parsing S-Expression for symbolic resonance:", e);
    }

    return contextTasks.slice(0, k);
  }
}

export class LLMHandler implements ProcedureHandler {
  name(): string {
    return "llm";
  }

  can_handle(content: string): boolean {
    return content.includes('(execute "llm"');
  }

  execute(
    content: string,
    bindings: Record<string, string>,
    world_model: WorldModel
  ): Task[] {
    console.warn("LLMHandler.execute is a placeholder.");
    const query = extract_param(content, "query");

    if (!query) {
      return [];
    }

    // Simulate LLM call
    const llm_result_text = `Simulated LLM response for: ${query}`;
    const llm_result_confidence = 0.8;

    const atom_content = `(search_result "${query}" "${llm_result_text}")`;
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
          confidence: llm_result_confidence,
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
  }
}
