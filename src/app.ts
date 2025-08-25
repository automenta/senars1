import { v4 as uuidv4 } from 'uuid';
import { generate_embedding } from './core/utils';
import { WorldModel } from './core/world-model';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler, InMemoryPatternMatcher, QuestionGeneratorHandler } from './core/implementations';
import { Task, SemanticAtom } from './core/models';
import { TaskType } from './core/types';
import { ProcedureHandler } from './core/interfaces';
import { Agenda } from './core/agenda';
import { SchemaRegistry } from './core/schema-registry';
import { DeductionSchema } from './core/schemas';
import { AbductionSchema } from './core/schemas/abduction';
import { InductionSchema } from './core/schemas/induction';
import { SafetyAnalysisSchema } from './core/schemas/safety_analysis';
import { SelfSafetySchema } from './core/schemas/self_safety';
import { ThoughtExpansionSchema } from './core/schemas/thought_expansion';
import { seed_data } from './core/seed';
import { CognitiveEngine } from './core/engine'; // Import the new engine
import { loadConfig, Config, LLMConfig } from './core/config';

export class App {
  world_model: WorldModel;
  agenda: Agenda;
  schema_registry: SchemaRegistry;
  private attention_policy: DefaultAttentionPolicy;
  private truth_policy: DefaultTruthPolicy;
  private resonance_strategy: DefaultResonanceStrategy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private engine: CognitiveEngine; // Add the engine instance
  private config: Config;
  private events: Record<string, Function[]> = {};

  // GUI can access these via getters
  public get last_scope_bindings(): Record<string, string> | undefined {
    return this.engine.last_scope_bindings;
  }
  public get last_scope_task(): Task | undefined {
    return this.engine.last_scope_task;
  }

  private constructor(config: Config, seedData: boolean = true) {
    this.config = config;
    this.attention_policy = new DefaultAttentionPolicy();
    this.truth_policy = new DefaultTruthPolicy();
    this.resonance_strategy = new DefaultResonanceStrategy();
    this.agenda = new Agenda();
    this.procedure_handlers = {};

    // Create the pattern matcher first, as it's a shared dependency
    const pattern_matcher = new InMemoryPatternMatcher();
    this.schema_registry = new SchemaRegistry(pattern_matcher);
    this.world_model = new WorldModel(this.resonance_strategy, this.truth_policy, this.schema_registry, pattern_matcher);

    const llmHandler = new LLMHandler(this.config.llm, this);
    this.procedure_handlers[llmHandler.name()] = llmHandler;

    const questionGeneratorHandler = new QuestionGeneratorHandler(this, llmHandler);
    this.procedure_handlers[questionGeneratorHandler.name()] = questionGeneratorHandler;

    this.engine = new CognitiveEngine(
      this.world_model,
      this.agenda,
      this.attention_policy,
      this.truth_policy,
      this.procedure_handlers,
      this.schema_registry
    );

    const deductionSchema = new DeductionSchema();
    this.schema_registry.register(deductionSchema);

    const abductionSchema = new AbductionSchema();
    this.schema_registry.register(abductionSchema);

    const inductionSchema = new InductionSchema();
    this.schema_registry.register(inductionSchema);

    const safetyAnalysisSchema = new SafetyAnalysisSchema();
    this.schema_registry.register(safetyAnalysisSchema);

    const selfSafetySchema = new SelfSafetySchema();
    this.schema_registry.register(selfSafetySchema);

    const thoughtExpansionSchema = new ThoughtExpansionSchema();
    this.schema_registry.register(thoughtExpansionSchema);

    if (seedData) {
      seed_data(this.world_model, this.agenda, this.attention_policy);
    }
  }

  public static async create(seedData: boolean = true): Promise<App> {
    const config = await loadConfig();
    return new App(config, seedData);
  }

  public update_llm_config(config: LLMConfig) {
    this.config.llm = config;
    const llmHandler = this.procedure_handlers['llm'] as LLMHandler;
    if (llmHandler) {
      llmHandler.update_config(config);
    }
  }

  // The app's tick now simply delegates to the engine
  public async tick() {
    await this.agenda.decay(this.attention_policy);
    await this.engine.tick();
  }

  // All methods below are for GUI interaction and state management
  public async add_new_thought(content: string, type: TaskType = TaskType.GOAL) {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: content,
      embedding: generate_embedding(content),
    };
    this.world_model.add_atom(atom);

    const newTask: Task = {
      id: uuidv4(),
      atom_id: atom.id,
      type: type,
      attention: this.attention_policy.calculate_initial({} as Task),
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [],
        schema_id: uuidv4(),
        source: 'user', // Tag task as originating from the user
      },
    };

    if (type === TaskType.BELIEF) {
      newTask.truth = { frequency: 0.7, confidence: 0.7 };
    }

    await this.agenda.push(newTask);
    console.log(`Added new thought: "${content}" as ${type}`);
  }

  public async boost_task(taskId: string) {
    const task = await this.agenda.find(taskId);
    if (task) {
      task.attention.priority = Math.min(1.0, task.attention.priority + 0.1);
      task.attention.durability = Math.min(1.0, task.attention.durability + 0.1);

      if (task.type === TaskType.BELIEF && task.truth) {
        task.truth.confidence = Math.min(1.0, task.truth.confidence + 0.1);
      }

      await this.agenda.updatePriority(taskId, task.attention.priority);
    }
  }

  public async reduce_task_priority(taskId: string) {
    const task = await this.agenda.find(taskId);
    if (task) {
      task.attention.priority = Math.max(0.0, task.attention.priority - 0.1);
      task.attention.durability = Math.max(0.0, task.attention.durability - 0.1);
      await this.agenda.updatePriority(taskId, task.attention.priority);
    }
  }

  public pin_task(taskId: string) {
    this.agenda.pin_task(taskId);
  }

  public is_task_pinned(taskId: string): boolean {
    return this.agenda.is_task_pinned(taskId);
  }

  public async star_belief(taskId: string) {
    const task = this.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
      task.attention.priority = Math.min(1.0, task.attention.priority + 0.2);
      task.attention.durability = Math.min(1.0, task.attention.durability + 0.2);
      await this.agenda.push(task);
    }
  }

  public question_belief(taskId: string) {
    const task = this.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
      const atom = this.world_model.get_atom(task.atom_id);
      this.add_new_thought(`${atom.content}?`, TaskType.GOAL);
    }
  }

  public forget_belief(taskId: string) {
    const task = this.world_model.tasks[taskId];
    if (task) {
      this.world_model.remove_task(taskId);
    }
  }

  public verify_belief(taskId: string) {
    const task = this.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
      task.verified = true;
      // Optionally, boost confidence of verified beliefs
      if (task.truth) {
        task.truth.confidence = Math.min(1.0, task.truth.confidence + 0.1);
      }
    }
  }

  public dispute_belief(taskId: string) {
    const task = this.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
        task.verified = false; // Mark as disputed
        if (task.truth) {
            task.truth.confidence = Math.max(0.0, task.truth.confidence - 0.2);
        }
        task.attention.durability = Math.max(0.0, task.attention.durability - 0.2);
    }
  }

  public on(eventName: string, callback: Function) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  public emit(eventName: string, data: any) {
    const eventCallbacks = this.events[eventName];
    if (eventCallbacks) {
      eventCallbacks.forEach(callback => callback(data));
    }
  }
}
