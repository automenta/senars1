import { v4 as uuidv4 } from 'uuid';
import { generate_embedding } from './core/utils';
import { WorldModel } from './core/world-model';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler, LLMConfig } from './core/implementations';
import { Task, SemanticAtom } from './core/models';
import { TaskType } from './core/types';
import { ProcedureHandler } from './core/interfaces';
import { Agenda } from './core/agenda';
import { SchemaRegistry } from './core/schema-registry';
import { DeductionSchema } from './core/schemas';
import { AbductionSchema } from './core/schemas/abduction';
import { InductionSchema } from './core/schemas/induction';
import { seed_data } from './core/seed';
import { CognitiveEngine } from './core/engine'; // Import the new engine

export class App {
  world_model: WorldModel;
  agenda: Agenda;
  schema_registry: SchemaRegistry;
  private attention_policy: DefaultAttentionPolicy;
  private truth_policy: DefaultTruthPolicy;
  private resonance_strategy: DefaultResonanceStrategy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private engine: CognitiveEngine; // Add the engine instance

  // GUI can access these via getters
  public get last_scope_bindings(): Record<string, string> | undefined {
    return this.engine.last_scope_bindings;
  }
  public get last_scope_task(): Task | undefined {
    return this.engine.last_scope_task;
  }

  constructor(seedData: boolean = true) {
    this.attention_policy = new DefaultAttentionPolicy();
    this.truth_policy = new DefaultTruthPolicy();
    this.resonance_strategy = new DefaultResonanceStrategy();
    this.world_model = new WorldModel(this.resonance_strategy, this.truth_policy);
    this.agenda = new Agenda();
    this.procedure_handlers = {};
    this.schema_registry = new SchemaRegistry(this.world_model.schema_index);

    // Placeholder for file-based config loading in Node.js
    // const fileConfig = this.load_config_from_file_system();

    const llmHandler = new LLMHandler(); // Pass fileConfig here
    this.procedure_handlers[llmHandler.name()] = llmHandler;

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

    if (seedData) {
      seed_data(this.world_model, this.agenda, this.attention_policy);
    }
  }

  public update_llm_config(config: LLMConfig) {
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
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() },
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
}
