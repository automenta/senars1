import { WorldModel } from './world-model';
import { Agenda } from './agenda';
import { IAttentionPolicy, ITruthPolicy, ProcedureHandler } from './interfaces';
import { Task } from './models';
import { resolveScopeBindings } from './scope';
import { is_procedure_task, execute_procedure } from './procedure';
import { TaskType } from './types';
import { SchemaRegistry } from './schema-registry';
import { InductionSchema } from './schemas/induction';

export class CognitiveEngine {
  private world_model: WorldModel;
  private agenda: Agenda;
  private attention_policy: IAttentionPolicy;
  private truth_policy: ITruthPolicy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private schema_registry: SchemaRegistry;
  private induction_schema?: InductionSchema;

  public last_scope_bindings: Record<string, string> | undefined;
  public last_scope_task: Task | undefined;

  constructor(
    world_model: WorldModel,
    agenda: Agenda,
    attention_policy: IAttentionPolicy,
    truth_policy: ITruthPolicy,
    procedure_handlers: Record<string, ProcedureHandler>,
    schema_registry: SchemaRegistry,
    induction_schema?: InductionSchema
  ) {
    this.world_model = world_model;
    this.agenda = agenda;
    this.attention_policy = attention_policy;
    this.truth_policy = truth_policy;
    this.procedure_handlers = procedure_handlers;
    this.schema_registry = schema_registry;
    this.induction_schema = induction_schema;
  }

  public async tick() {
    if (await this.agenda.isEmpty()) return;

    try {
      const task_a = await this.agenda.pop();
      if (!task_a) return;

      if (task_a.type === TaskType.BELIEF) {
        await this.world_model.add_task(task_a);
      }

      const context = this.world_model.find_resonant(task_a, 10);

      const scope_bindings = resolveScopeBindings(task_a, context, this.world_model);
      this.last_scope_bindings = scope_bindings;
      this.last_scope_task = scope_bindings ? task_a : undefined;

      if (is_procedure_task(task_a, this.world_model)) {
        await this.handle_procedure_task(task_a, scope_bindings);
      } else {
        await this.handle_single_premise_task(task_a, scope_bindings);
        await this.handle_dual_premise_task(task_a, context, scope_bindings);
      }
    } catch (error) {
      console.error("Cognitive Engine Tick Error:", error);
    }
  }

  private async handle_procedure_task(task: Task, scope_bindings?: Record<string, string>) {
    const results = await execute_procedure(
      task,
      this.world_model,
      this.procedure_handlers,
      scope_bindings
    );

    const parent_atom = this.world_model.get_atom(task.atom_id);
    const procedure_name = parent_atom.content.split(' ')[1].replace(/"/g, '');
    const new_path = (task.stamp.path || [parent_atom.content]).concat([`[Procedure: ${procedure_name}]`]);

    for (const result_task of results) {
      result_task.stamp = {
        timestamp: Date.now() / 1000,
        parent_ids: [task.id],
        schema_id: task.stamp.schema_id,
        scope_bindings: scope_bindings,
        path: new_path,
      };
      this.agenda.push(result_task);
    }
  }

  private async handle_single_premise_task(task_a: Task, scope_bindings?: Record<string, string>) {
    const match_results = this.world_model.find_single_premise_schemas(task_a);

    for (const match_result of match_results) {
      const schema = this.schema_registry.get(match_result.schema_id);
      if (!schema) continue;

      let derived: Task[] = [];
      if (scope_bindings) {
        derived = await schema.apply_with_bindings(
          task_a, undefined, this.truth_policy, scope_bindings, this.world_model, match_result.bindings
        );
      } else {
        derived = await schema.apply(task_a, undefined, this.truth_policy, this.world_model, match_result.bindings);
      }

      for (const new_task of derived) {
        this.enqueue_derived_task(new_task, task_a, undefined, schema.id, scope_bindings);
      }
    }
  }

  private async handle_dual_premise_task(task_a: Task, context: Task[], scope_bindings?: Record<string, string>) {
    for (const task_b of context) {
      await this.apply_dual_premise_schemas(task_a, task_b, scope_bindings);

      // Special handling for InductionSchema
      if (this.induction_schema && task_a.type === TaskType.BELIEF && task_b.type === TaskType.BELIEF) {
        const derived = await this.induction_schema.apply(task_a, task_b, this.truth_policy, this.world_model, {});
        for (const new_task of derived) {
          this.enqueue_derived_task(new_task, task_a, task_b, this.induction_schema.id, scope_bindings);
        }
      }
    }
  }

  private async apply_dual_premise_schemas(task_a: Task, task_b: Task, scope_bindings?: Record<string, string>) {
    const match_results = this.world_model.find_dual_premise_schemas(task_a, task_b);

    for (const match_result of match_results) {
      const schema = this.schema_registry.get(match_result.schema_id);
      if (!schema) continue;

      let derived: Task[] = [];
      if (scope_bindings) {
        derived = await schema.apply_with_bindings(
          task_a, task_b, this.truth_policy, scope_bindings, this.world_model, match_result.bindings
        );
      } else {
        derived = await schema.apply(task_a, task_b, this.truth_policy, this.world_model, match_result.bindings);
      }

      for (const new_task of derived) {
        this.enqueue_derived_task(new_task, task_a, task_b, schema.id, scope_bindings);
      }
    }
  }

  private async enqueue_derived_task(new_task: Task, parent_a: Task, parent_b: Task | undefined, schema_id: string, scope_bindings?: Record<string, string>) {
    if (new_task.type === TaskType.BELIEF && parent_b) {
      new_task.truth = this.truth_policy.derivation(
        parent_a, parent_b, schema_id
      );
    }

    if (parent_b) {
        new_task.attention = this.attention_policy.calculate_derived(
            parent_a, parent_b, schema_id
        );
    } else {
        // If there's no second parent, we can't use calculate_derived directly.
        // Let's create a new attention value based on the single parent.
        new_task.attention = {
            priority: parent_a.attention.priority * 0.9, // Slightly less than parent
            durability: parent_a.attention.durability * 0.9
        };
    }

    const schema_name = this.schema_registry.get(schema_id)?.constructor.name || 'UnknownSchema';
    const parent_a_content = this.world_model.get_atom(parent_a.atom_id).content;

    let base_path: string[];
    const path_a = parent_a.stamp.path;
    if (path_a) {
        base_path = path_a;
    } else {
        base_path = [parent_a_content];
    }

    if (parent_b) {
        const parent_b_content = this.world_model.get_atom(parent_b.atom_id).content;
        const path_b = parent_b.stamp.path;
        if (path_a && path_b) {
            base_path = Array.from(new Set([...path_a, ...path_b]));
        } else if (path_b) {
            base_path = path_b;
        } else {
            base_path = Array.from(new Set([parent_a_content, parent_b_content]));
        }
    }

    const new_path = base_path.concat([`[Schema: ${schema_name}]`]);

    new_task.stamp = {
      timestamp: Date.now() / 1000,
      parent_ids: parent_b ? [parent_a.id, parent_b.id] : [parent_a.id],
      schema_id: schema_id,
      scope_bindings: scope_bindings,
      path: new_path,
    };
    await this.agenda.push(new_task);
  }
}
