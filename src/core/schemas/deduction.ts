import { ICognitiveSchema, ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { UUID, TaskType } from '../types';
import { substituteInContent } from '../scope';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';

export class DeductionSchema implements ICognitiveSchema {
  public readonly id: UUID = uuidv4();

  get_trigger_pattern(): TriggerPattern {
    // Modus Ponens: If P implies Q, and P is true, then Q is true.
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

    // The bindings from the pattern match ($P, $Q) might contain variables
    // that need to be substituted from the premise.
    // For example, if P is (eats cat $food) and premise is (eats cat chocolate),
    // we need to bind $food to "chocolate".
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
      id: uuidv4(),
      content: derivedContent,
      embedding: [], // Embeddings should be generated for real use cases
    };
    world_model.add_atom(derivedAtom);

    const derivedTask: Task = {
      id: uuidv4(),
      atom_id: derivedAtom.id,
      type: TaskType.BELIEF,
      // Deduction results in high confidence
      truth: truth_policy.derivation(implication_task, premise_task, this.id),
      attention: { priority: 0.8, durability: 0.8 },
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
      // The order matters for deduction. We need to know which is the implication and which is the premise.
      // We assume the pattern matcher provides bindings based on a consistent order.
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
      return this._derive(task_a, task_b, truth_policy, world_model, bindings, scope_bindings);
    } catch (e) {
      console.error("Error in DeductionSchema.apply_with_bindings:", e);
      return [];
    }
  }
}
