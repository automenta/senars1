import { ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { substituteInContent } from '../scope';
import { WorldModel } from '../world-model';
import { BaseSchema } from './base_schema';
import { generateUUID, createDerivedTask } from './utils';
import { generate_embedding } from '../utils';

export class AbductionSchema extends BaseSchema {
  constructor() {
    super('abduction_schema');
  }

  get_trigger_pattern(): TriggerPattern {
    return ["(implies $P $Q)", "($Q)"];
  }

  protected async _derive(
    implication_task: Task,
    conclusion_task: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Promise<Task[]> {
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
      id: generateUUID('atom'),
      content: derivedContent,
      embedding: generate_embedding(derivedContent),
    };
    await world_model.add_atom(derivedAtom);

    const truth = truth_policy.derivation(implication_task, conclusion_task, this.id);
    const derivedTask = createDerivedTask({
        atom_id: derivedAtom.id,
        // Abduction results in lower confidence
        truth: {
            ...truth,
            confidence: truth.confidence * 0.5
        },
        attention: { priority: 0.6, durability: 0.6 },
        parent_ids: [implication_task.id, conclusion_task.id],
        schema_id: this.id,
        scope_bindings: scope_bindings,
    });

    return [derivedTask];
  }
}
