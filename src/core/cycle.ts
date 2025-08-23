import { PriorityQueue } from './agenda';
import { WorldModel } from './world-model';
import { IAttentionPolicy, ITruthPolicy, ICognitiveSchema, ProcedureHandler } from './interfaces';
import { Task, DerivationStamp, AttentionValue, TruthValue } from './models';
import { UUID, TaskType } from './types';
import { resolveScopeBindings, substituteInContent } from './scope';
import { is_procedure_task, execute_procedure } from './procedure';
import { SchemaRegistry } from './schema-registry';

// Helper to generate a UUID (placeholder)
function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
}

export async function worker_loop(
  agenda: PriorityQueue,
  world_model: WorldModel,
  attention_policy: IAttentionPolicy,
  truth_policy: ITruthPolicy,
  procedure_handlers: Record<string, ProcedureHandler>
): Promise<void> {
  while (true) {
    if (agenda.isEmpty()) {
      // In a real system, this might involve waiting or sleeping
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for a short period
      continue;
    }

    // 1. SELECT highest priority task
    const task_a = agenda.pop();

    // 2. RESONATE: Find context
    const context = world_model.find_resonant(task_a, 10); // k=10 as per core.md example

    // 3. SCOPE RESOLUTION
    let scope_bindings: Record<string, string> | undefined = undefined;
    if (context.length > 0) {
      scope_bindings = resolveScopeBindings(task_a, context[0], world_model);
    }

    // 4. PROCESS BASED ON TASK TYPE
    if (task_a.type === TaskType.PROCEDURE) {
      const results = execute_procedure(
        task_a,
        world_model,
        procedure_handlers,
        scope_bindings
      );
      for (const result_task of results) {
        result_task.stamp = {
          timestamp: Date.now() / 1000,
          parent_ids: [task_a.id],
          schema_id: task_a.stamp.schema_id, // Or a new schema ID if procedure itself is a schema
          scope_bindings: scope_bindings,
        };
        agenda.push(result_task);
      }
      continue;
    }

    // 5. MATCH & DERIVE
    for (const task_b of context) {
      const schemas = world_model.find_schemas(task_a, task_b);
      for (const schema of schemas) {
        let derived: Task[] = [];
        if (scope_bindings) {
          derived = schema.apply_with_bindings(
            task_a, task_b, truth_policy, scope_bindings, world_model
          ); // Pass world_model
        } else {
          derived = schema.apply(task_a, task_b, truth_policy, world_model);
        } // Pass world_model

        // 6. INTEGRATE & ENQUEUE
        for (const new_task of derived) {
          if (is_procedure_task(new_task, world_model)) {
            const procedure_results = execute_procedure(
              new_task, world_model, procedure_handlers, scope_bindings
            );
            for (const proc_result_task of procedure_results) {
              proc_result_task.stamp = {
                timestamp: Date.now() / 1000,
                parent_ids: [new_task.id],
                schema_id: schema.id,
                scope_bindings: scope_bindings,
              };
              agenda.push(proc_result_task);
            }
            continue;
          }

          // Standard task processing
          if (new_task.type === TaskType.BELIEF) {
            new_task.truth = truth_policy.derivation(
              task_a, task_b, schema.id
            );
          }
          new_task.attention = attention_policy.calculate_derived(
            task_a, task_b, schema.id
          );
          new_task.stamp = {
            timestamp: Date.now() / 1000,
            parent_ids: [task_a.id, task_b.id],
            schema_id: schema.id,
            scope_bindings: scope_bindings,
          };
          agenda.push(new_task);
        }
      }
    }

    // 7. MEMORIZE BELIEFS
    if (task_a.type === TaskType.BELIEF) {
      world_model.add_task(task_a);
    }
  }
}