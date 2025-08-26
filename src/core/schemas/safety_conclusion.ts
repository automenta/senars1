import { ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { BaseSchema } from './base_schema';
import { generateUUID, createDerivedTask } from './utils';
import { TaskType } from '../types';
import { generate_embedding } from '../utils';

export class SafetyConclusionSchema extends BaseSchema {
  constructor() {
    super('safety_conclusion_schema');
  }

  get_trigger_pattern(): TriggerPattern {
    // Triggers when there's a belief that a substance is toxic, and a belief that an animal ate it.
    return ["(is_toxic $substance $animal)", "(eats $animal $substance)"];
  }

  protected async _derive(
    task_a: Task, // (is_toxic chocolate cat)
    task_b: Task | undefined,   // (eats cat chocolate)
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    // This schema requires two tasks.
    if (!task_b) {
        return [];
    }

    // This schema should only trigger on a confirmed BELIEF of toxicity,
    // not a QUESTION about it.
    if (task_a.type !== TaskType.BELIEF) {
      return [];
    }

    const alert_content = `(send_alert user "Cat is in danger from chocolate!")`;

    const derivedAtom: SemanticAtom = {
      id: generateUUID('atom'),
      content: alert_content,
      embedding: generate_embedding(alert_content),
    };
    await world_model.add_atom(derivedAtom);

    const derivedTask = createDerivedTask({
      atom_id: derivedAtom.id,
      type: TaskType.GOAL, // This schema generates a GOAL to alert the user
      attention: { priority: 0.98, durability: 0.95 }, // Very high priority
      parent_ids: [task_a.id, task_b.id],
      schema_id: this.id,
    });

    return [derivedTask];
  }
}
