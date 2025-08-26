import { ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { BaseSchema } from './base_schema';
import { generateUUID, createDerivedTask } from './utils';
import { TaskType }from '../types';
import { generate_embedding } from '../utils';

export class SafetyAnalysisSchema extends BaseSchema {
  constructor() {
    super('safety_analysis_schema');
  }

  get_trigger_pattern(): TriggerPattern {
    // Triggers when there's a belief someone ate something, and a goal to check if it's safe.
    return ["(eats $animal $substance)", "(is_safe_for $animal $substance)"];
  }

  protected async _derive(
    belief_task: Task, // (eats cat chocolate)
    goal_task: Task,   // (is_safe_for cat chocolate)
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Promise<Task[]> {
    const substance = bindings['$substance'];
    const animal = bindings['$animal'];

    if (!substance || !animal) {
      return [];
    }

    const derivedContent = `(is_toxic ${substance} ${animal})`;

    // Note: In a more advanced implementation, the engine or agenda would handle
    // deduplication of tasks to avoid asking the same question multiple times.
    // For now, we assume this check happens elsewhere or is not critical.

    const derivedAtom: SemanticAtom = {
      id: generateUUID('atom'),
      content: derivedContent,
      embedding: generate_embedding(derivedContent),
    };
    await world_model.add_atom(derivedAtom);

    const derivedTask = createDerivedTask({
      atom_id: derivedAtom.id,
      type: TaskType.QUESTION, // This schema generates a QUESTION
      attention: { priority: 0.95, durability: 0.9 }, // High priority question
      parent_ids: [belief_task.id, goal_task.id],
      schema_id: this.id,
    });

    return [derivedTask];
  }
}
