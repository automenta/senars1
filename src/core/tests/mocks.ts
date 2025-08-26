import { IResonanceStrategy, ITruthPolicy } from '../interfaces';
import { Task } from '../models';
import { WorldModel } from '../world-model';
import { UUID } from '../types';

export class MockResonanceStrategy implements IResonanceStrategy {
  find_context(focus: Task, world_model: WorldModel, k: number): Task[] {
    return [];
  }
}

export class MockTruthPolicy implements ITruthPolicy {
  revision(belief_a: Task, belief_b: Task) {
    return { frequency: 0.6, confidence: 0.6 };
  }
  derivation(premise_a: Task, premise_b: Task, schema_id: UUID) {
    return { frequency: 0.7, confidence: 0.7 };
  }
}
