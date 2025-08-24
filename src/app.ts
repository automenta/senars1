import { v4 as uuidv4 } from 'uuid';
import { WorldModel } from './core/world-model';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler } from './core/implementations';
import { Task, SemanticAtom } from './core/models';
import { TaskType } from './core/types';
import { ProcedureHandler } from './core/interfaces';
import { Agenda } from './core/agenda';
import { resolveScopeBindings } from './core/scope';
import { is_procedure_task, execute_procedure } from './core/procedure';
import { SchemaRegistry } from './core/schema-registry';
import { DeductionSchema } from './core/schemas';
import { AbductionSchema } from './core/schemas/abduction';
import { InductionSchema } from './core/schemas/induction';
import { seed_data } from './core/seed';

export class App {
  world_model: WorldModel;
  agenda: Agenda;
  schema_registry: SchemaRegistry;
  private attention_policy: DefaultAttentionPolicy;
  private truth_policy: DefaultTruthPolicy;
  private resonance_strategy: DefaultResonanceStrategy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private pinned_tasks: Set<string>;
  public last_scope_bindings: Record<string, string> | undefined;

  constructor() {
    this.pinned_tasks = new Set();
    this.last_scope_bindings = undefined;
    this.attention_policy = new DefaultAttentionPolicy();
    this.truth_policy = new DefaultTruthPolicy();
    this.resonance_strategy = new DefaultResonanceStrategy();
    this.world_model = new WorldModel(this.resonance_strategy, this.truth_policy);
    this.agenda = new Agenda();
    this.procedure_handlers = {};
    this.schema_registry = SchemaRegistry.getInstance();

    const llmHandler = new LLMHandler();
    this.procedure_handlers[llmHandler.name()] = llmHandler;

    const deductionSchema = new DeductionSchema();
    this.schema_registry.register(deductionSchema);

    const abductionSchema = new AbductionSchema();
    this.schema_registry.register(abductionSchema);

    const inductionSchema = new InductionSchema();
    this.schema_registry.register(inductionSchema);

    seed_data(this.world_model, this.agenda, this.attention_policy);
  }

  public async tick() {
    if (await this.agenda.isEmpty()) return;

    const task_a = await this.agenda.pop();
    const context = this.world_model.find_resonant(task_a, 10);
    this.last_scope_bindings = undefined;
    if (context.length > 0) {
      this.last_scope_bindings = resolveScopeBindings(task_a, context, this.world_model);
    }
    const scope_bindings = this.last_scope_bindings;

    if (task_a.type === TaskType.PROCEDURE) {
      await this.handle_procedure_task(task_a, scope_bindings);
    } else {
      await this.handle_regular_task(task_a, context, scope_bindings);
    }

    if (task_a.type === TaskType.BELIEF) {
      this.world_model.add_task(task_a);
    }
  }

  private async handle_procedure_task(task: Task, scope_bindings?: Record<string, string>) {
    const results = await execute_procedure(
      task,
      this.world_model,
      this.procedure_handlers,
      scope_bindings
    );
    for (const result_task of results) {
      result_task.stamp = {
        timestamp: Date.now() / 1000,
        parent_ids: [task.id],
        schema_id: task.stamp.schema_id,
        scope_bindings: scope_bindings,
      };
      this.agenda.push(result_task);
    }
  }

  private async handle_regular_task(task_a: Task, context: Task[], scope_bindings?: Record<string, string>) {
    for (const task_b of context) {
      await this.apply_schemas(task_a, task_b, scope_bindings);
    }
  }

  private async apply_schemas(task_a: Task, task_b: Task, scope_bindings?: Record<string, string>) {
    const schemas = this.world_model.find_schemas(task_a, task_b);
    for (const schema of schemas) {
      let derived: Task[] = [];
      if (scope_bindings) {
        derived = schema.apply_with_bindings(
          task_a, task_b, this.truth_policy, scope_bindings, this.world_model
        );
      } else {
        derived = schema.apply(task_a, task_b, this.truth_policy, this.world_model);
      }

      for (const new_task of derived) {
        if (is_procedure_task(new_task, this.world_model)) {
          await this.handle_procedure_task(new_task, scope_bindings);
        } else {
          this.enqueue_derived_task(new_task, task_a, task_b, schema.id, scope_bindings);
        }
      }
    }
  }

  private async enqueue_derived_task(new_task: Task, parent_a: Task, parent_b: Task, schema_id: string, scope_bindings?: Record<string, string>) {
    if (new_task.type === TaskType.BELIEF) {
      new_task.truth = this.truth_policy.derivation(
        parent_a, parent_b, schema_id
      );
    }
    new_task.attention = this.attention_policy.calculate_derived(
      parent_a, parent_b, schema_id
    );
    new_task.stamp = {
      timestamp: Date.now() / 1000,
      parent_ids: [parent_a.id, parent_b.id],
      schema_id: schema_id,
      scope_bindings: scope_bindings,
    };
    await this.agenda.push(new_task);
  }

  public async add_new_thought(content: string, type: TaskType = TaskType.GOAL) {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: content,
      embedding: [],
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
    if (this.pinned_tasks.has(taskId)) {
      this.pinned_tasks.delete(taskId);
    } else {
      this.pinned_tasks.add(taskId);
    }
  }

  public is_task_pinned(taskId: string): boolean {
    return this.pinned_tasks.has(taskId);
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
}
