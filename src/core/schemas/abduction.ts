import { ICognitiveSchema, ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { UUID, TaskType } from '../types';
import { substituteInContent } from '../scope';
import { WorldModel } from '../world-model';

function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
}

export class AbductionSchema implements ICognitiveSchema {
  public readonly id: UUID = generate_uuid("abduction_schema");

  get_trigger_pattern(): TriggerPattern {
    return ["(implies $P $Q)", "($Q)"];
  }

  private _derive(
    implication_task: Task,
    conclusion_task: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Task[] {
    let derivedContent = bindings['$P'];
    if (!derivedContent) return [];

    // Substitute any remaining variables from the conclusion bindings
    for (const key in bindings) {
        if (key !== '$P' && key !== '$Q') {
            const placeholder = new RegExp(key.replace('$', '\\$'), 'g');
            derivedContent = derivedContent.replace(placeholder, bindings[key]);
        }
    }

    if (scope_bindings) {
        derivedContent = substituteInContent(derivedContent, scope_bindings);
    }

    const derivedAtom: SemanticAtom = {
      id: generate_uuid(),
      content: derivedContent,
      embedding: [],
    };
    world_model.add_atom(derivedAtom);

    const derivedTask: Task = {
      id: generate_uuid(),
      atom_id: derivedAtom.id,
      type: TaskType.BELIEF,
      // Abduction results in lower confidence
      truth: {
          ...truth_policy.derivation(implication_task, conclusion_task, this.id),
          confidence: truth_policy.derivation(implication_task, conclusion_task, this.id).confidence * 0.5
      },
      attention: { priority: 0.6, durability: 0.6 },
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [implication_task.id, conclusion_task.id],
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
      return this._derive(task_a, task_b, truth_policy, world_model, bindings);
    } catch (e) {
      console.error("Error in AbductionSchema.apply:", e);
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
      return this._derive(task_a, task_b, truth_policy, world_model, bindings, scope_bindings);
    } catch (e) {
      console.error("Error in AbductionSchema.apply_with_bindings:", e);
      return [];
    }
  }
}
