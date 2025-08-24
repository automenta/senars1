import { ICognitiveSchema, ITruthPolicy, TriggerPattern } from './interfaces';
import { Task, SemanticAtom } from './models';
import { UUID, TaskType } from './types';
import { substituteInContent } from './scope';
import { WorldModel } from './world-model';

// Helper to generate a UUID (placeholder)
function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
}

export class DeductionSchema implements ICognitiveSchema {
  public readonly id: UUID = generate_uuid("deduction_schema");

  get_trigger_pattern(): TriggerPattern {
    return ["(implies $P $Q)", "$P"];
  }

  private _derive(
    implication_task: Task,
    premise_task: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Task[] {
    let derivedContent = bindings['$Q'];
    if (!derivedContent) return [];

    // Substitute any remaining variables from the premise bindings
    for (const key in bindings) {
        if (key !== '$P' && key !== '$Q') {
            const placeholder = new RegExp(key.replace('$', '\\$'), 'g');
            derivedContent = derivedContent.replace(placeholder, bindings[key]);
        }
    }

    // Apply scope substitutions if any
    if (scope_bindings) {
        derivedContent = substituteInContent(derivedContent, scope_bindings);
    }

    const derivedAtom: SemanticAtom = {
      id: generate_uuid(),
      content: derivedContent,
      embedding: [], // Placeholder for embedding
    };
    world_model.add_atom(derivedAtom);

    const derivedTask: Task = {
      id: generate_uuid(),
      atom_id: derivedAtom.id,
      type: TaskType.BELIEF,
      truth: truth_policy.derivation(implication_task, premise_task, this.id),
      attention: { priority: 0.7, durability: 0.7 }, // Example attention
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [implication_task.id, premise_task.id],
        schema_id: this.id,
        scope_bindings: scope_bindings,
      },
    };

    return [derivedTask];
  }

  apply(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Task[] {
    try {
      // The matcher ensures task_a matches the first pattern part and task_b the second.
      return this._derive(task_a, task_b, truth_policy, world_model, bindings);
    } catch (e) {
      console.error("Error in DeductionSchema.apply:", e);
      return [];
    }
  }

  apply_with_bindings(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Task[] {
    try {
      // The matcher ensures task_a matches the first pattern part and task_b the second.
      return this._derive(task_a, task_b, truth_policy, world_model, bindings, scope_bindings);
    } catch (e) {
      console.error("Error in DeductionSchema.apply_with_bindings:", e);
      return [];
    }
  }
}