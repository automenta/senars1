import { ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { substituteInContent } from '../scope';
import { WorldModel } from '../world-model';
import { BaseSchema } from './base_schema';
import { generateUUID, createDerivedTask } from './utils';

export class DeductionSchema extends BaseSchema {
  constructor() {
    super('deduction_schema');
  }

  get_trigger_pattern(): TriggerPattern {
    // Modus Ponens: If P implies Q, and P is true, then Q is true.
    return ["(implies $P $Q)", "($P)"];
  }

  protected async _derive(
    implication_task: Task,
    premise_task: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Promise<Task[]> {
    let derivedContent = bindings['$Q'];
    if (!derivedContent) return [];

    // The bindings from the pattern match ($P, $Q) might contain variables
    // that need to be substituted from the premise.
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
      id: generateUUID('atom'),
      content: derivedContent,
      embedding: [], // Embeddings should be generated for real use cases
    };
    await world_model.add_atom(derivedAtom);

    const derivedTask = createDerivedTask({
        atom_id: derivedAtom.id,
        truth: truth_policy.derivation(implication_task, premise_task, this.id),
        attention: { priority: 0.8, durability: 0.8 },
        parent_ids: [implication_task.id, premise_task.id],
        schema_id: this.id,
        scope_bindings: scope_bindings,
    });

    return [derivedTask];
  }
}
