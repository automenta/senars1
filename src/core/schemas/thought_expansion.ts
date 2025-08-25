import { ICognitiveSchema, ITruthPolicy } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { UUID, TaskType } from '../types';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';

export class ThoughtExpansionSchema implements ICognitiveSchema {
  public readonly id: UUID = uuidv4();

  get_trigger_pattern(): string {
    return '($thought)';
  }

  async apply(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    if (task_a.stamp.source !== 'user') {
      return [];
    }

    const thoughtContent = bindings['$thought'];
    if (!thoughtContent) {
      return [];
    }

    const derivedContent = `(execute "question_generator" for_thought:"${thoughtContent}")`;

    const derivedAtom: SemanticAtom = {
      id: uuidv4(),
      content: derivedContent,
      embedding: [],
    };
    await world_model.add_atom(derivedAtom);

    const derivedTask: Task = {
      id: uuidv4(),
      atom_id: derivedAtom.id,
      type: TaskType.GOAL,
      attention: { priority: 0.8, durability: 0.8 },
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [task_a.id],
        schema_id: this.id,
      },
    };

    return [derivedTask];
  }

  async apply_with_bindings(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    // This schema does not use scope bindings, so we can just call the regular apply method.
    return this.apply(task_a, task_b, truth_policy, world_model, bindings);
  }
}
