import { v4 as uuidv4 } from 'uuid';
import { WorldModel } from './core/world-model';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler } from './core/implementations';
import { Task, SemanticAtom } from './core/models';
import { TaskType } from './core/types';
import { ProcedureHandler } from './core/interfaces';
import { PriorityQueue } from './core/agenda';
import { resolveScopeBindings } from './core/scope';
import { is_procedure_task, execute_procedure } from './core/procedure';
import { SchemaRegistry } from './core/schema-registry';
import { DeductionSchema } from './core/schemas';
import { seed_data } from './core/seed';

export class App {
  world_model: WorldModel;
  agenda: PriorityQueue;
  schema_registry: SchemaRegistry;
  private attention_policy: DefaultAttentionPolicy;
  private truth_policy: DefaultTruthPolicy;
  private resonance_strategy: DefaultResonanceStrategy;
  private procedure_handlers: Record<string, ProcedureHandler>;

  constructor() {
    this.attention_policy = new DefaultAttentionPolicy();
    this.truth_policy = new DefaultTruthPolicy();
    this.resonance_strategy = new DefaultResonanceStrategy();
    this.world_model = new WorldModel(this.resonance_strategy, this.truth_policy);
    this.agenda = new PriorityQueue();
    this.procedure_handlers = {};
    this.schema_registry = SchemaRegistry.getInstance();

    const llmHandler = new LLMHandler();
    this.procedure_handlers[llmHandler.name()] = llmHandler;

    const deductionSchema = new DeductionSchema();
    this.schema_registry.register(deductionSchema);

    seed_data(this.world_model, this.agenda, this.attention_policy);
  }

  public async tick() {
    if (this.agenda.isEmpty()) return;

    const task_a = this.agenda.pop();
    const context = this.world_model.find_resonant(task_a, 10);
    let scope_bindings: Record<string, string> | undefined = undefined;
    if (context.length > 0) {
      scope_bindings = resolveScopeBindings(task_a, context[0], this.world_model);
    }

    if (task_a.type === TaskType.PROCEDURE) {
      this.handle_procedure_task(task_a, scope_bindings);
    } else {
      this.handle_regular_task(task_a, context, scope_bindings);
    }

    if (task_a.type === TaskType.BELIEF) {
      this.world_model.add_task(task_a);
    }
  }

  private handle_procedure_task(task: Task, scope_bindings?: Record<string, string>) {
    const results = execute_procedure(
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

  private handle_regular_task(task_a: Task, context: Task[], scope_bindings?: Record<string, string>) {
    for (const task_b of context) {
      this.apply_schemas(task_a, task_b, scope_bindings);
    }
  }

  private apply_schemas(task_a: Task, task_b: Task, scope_bindings?: Record<string, string>) {
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
          this.handle_procedure_task(new_task, scope_bindings);
        } else {
          this.enqueue_derived_task(new_task, task_a, task_b, schema.id, scope_bindings);
        }
      }
    }
  }

  private enqueue_derived_task(new_task: Task, parent_a: Task, parent_b: Task, schema_id: string, scope_bindings?: Record<string, string>) {
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
    this.agenda.push(new_task);
  }

  public add_new_thought(content: string, type: TaskType = TaskType.GOAL) {
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

    this.agenda.push(newTask);
    console.log(`Added new thought: "${content}" as ${type}`);
  }
}
