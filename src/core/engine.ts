import { WorldModel } from './world-model';
import { Agenda } from './agenda';
import { IAttentionPolicy, ITruthPolicy, ProcedureHandler } from './interfaces';
import { Task } from './models';
import { resolveScopeBindings } from './scope';
import { is_procedure_task, execute_procedure } from './procedure';
import { TaskType } from './types';
import { SchemaRegistry } from './schema-registry';

export class CognitiveEngine {
  private world_model: WorldModel;
  private agenda: Agenda;
  private attention_policy: IAttentionPolicy;
  private truth_policy: ITruthPolicy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private schema_registry: SchemaRegistry;

  public last_scope_bindings: Record<string, string> | undefined;
  public last_scope_task: Task | undefined;

  constructor(
    world_model: WorldModel,
    agenda: Agenda,
    attention_policy: IAttentionPolicy,
    truth_policy: ITruthPolicy,
    procedure_handlers: Record<string, ProcedureHandler>,
    schema_registry: SchemaRegistry
  ) {
    this.world_model = world_model;
    this.agenda = agenda;
    this.attention_policy = attention_policy;
    this.truth_policy = truth_policy;
    this.procedure_handlers = procedure_handlers;
    this.schema_registry = schema_registry;
  }

  public async tick() {
    if (await this.agenda.isEmpty()) return;

    const task_a = await this.agenda.pop();
    const context = this.world_model.find_resonant(task_a, 10);

    this.last_scope_bindings = undefined;
    this.last_scope_task = undefined;
    if (context.length > 0) {
      this.last_scope_bindings = resolveScopeBindings(task_a, context, this.world_model);
      if (this.last_scope_bindings) {
        this.last_scope_task = task_a;
      }
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

  private async handle_regular_task(task_a: Task, context: Task[], scope_bindings?: Record<string, string>) {
    for (const task_b of context) {
      await this.apply_schemas(task_a, task_b, scope_bindings);
    }
  }

  private async apply_schemas(task_a: Task, task_b: Task, scope_bindings?: Record<string, string>) {
    const match_results = this.world_model.find_schemas(task_a, task_b);

    for (const match_result of match_results) {
      const schema = this.schema_registry.get(match_result.schema_id);
      if (!schema) continue;

      let derived: Task[] = [];
      if (scope_bindings) {
        derived = schema.apply_with_bindings(
          task_a, task_b, this.truth_policy, scope_bindings, this.world_model, match_result.bindings
        );
      } else {
        derived = schema.apply(task_a, task_b, this.truth_policy, this.world_model, match_result.bindings);
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

    const schema_name = this.schema_registry.get(schema_id)?.constructor.name || 'UnknownSchema';
    const parent_a_content = this.world_model.get_atom(parent_a.atom_id).content;
    const parent_b_content = this.world_model.get_atom(parent_b.atom_id).content;

    let base_path: string[];
    const path_a = parent_a.stamp.path;
    const path_b = parent_b.stamp.path;

    if (path_a && path_b) {
      // If both have paths, merge them (simple union, could be more sophisticated)
      base_path = Array.from(new Set([...path_a, ...path_b]));
    } else if (path_a) {
      base_path = path_a;
    } else if (path_b) {
      base_path = path_b;
    } else {
      base_path = [parent_a_content, parent_b_content];
    }

    const new_path = base_path.concat([`[Schema: ${schema_name}]`]);

    new_task.stamp = {
      timestamp: Date.now() / 1000,
      parent_ids: [parent_a.id, parent_b.id],
      schema_id: schema_id,
      scope_bindings: scope_bindings,
      path: new_path,
    };
    await this.agenda.push(new_task);
  }
}
