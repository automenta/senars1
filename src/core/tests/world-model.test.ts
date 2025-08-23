import { describe, it, expect, beforeEach } from 'vitest';
import { WorldModel } from '../world-model';
import { SemanticAtom, Task } from '../models';
import { IResonanceStrategy, ITruthPolicy } from '../interfaces';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';

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

describe('WorldModel', () => {
  let worldModel: WorldModel;
  let resonanceStrategy: IResonanceStrategy;
  let truthPolicy: ITruthPolicy;

  beforeEach(() => {
    resonanceStrategy = new MockResonanceStrategy();
    truthPolicy = new MockTruthPolicy();
    worldModel = new WorldModel(resonanceStrategy, truthPolicy);
  });

  it('should add and retrieve an atom', () => {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: '(test atom)',
      embedding: [0.1],
    };
    worldModel.add_atom(atom);
    const retrieved = worldModel.get_atom(atom.id);
    expect(retrieved).toEqual(atom);
  });

  it('should add and retrieve a task', () => {
    const task: Task = {
      id: uuidv4(),
      atom_id: uuidv4(),
      type: TaskType.GOAL,
      attention: { priority: 0.8, durability: 0.8 },
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [],
        schema_id: uuidv4(),
      },
    };
    worldModel.add_task(task);
    const retrieved = worldModel.get_task(task.id);
    expect(retrieved).toEqual(task);
  });

  it('should handle belief revision', () => {
    const atomId = uuidv4();
    const atom: SemanticAtom = { id: atomId, content: '(test)', embedding: [] };
    worldModel.add_atom(atom);

    const belief1: Task = {
      id: uuidv4(),
      atom_id: atomId,
      type: TaskType.BELIEF,
      truth: { frequency: 0.5, confidence: 0.5 },
      attention: { priority: 0.5, durability: 0.5 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    worldModel.add_task(belief1);

    const belief2: Task = {
      id: uuidv4(),
      atom_id: atomId,
      type: TaskType.BELIEF,
      truth: { frequency: 0.7, confidence: 0.7 },
      attention: { priority: 0.7, durability: 0.7 },
      stamp: { timestamp: 1, parent_ids: [], schema_id: '' },
    };
    worldModel.add_task(belief2);

    const retrieved = worldModel.find_belief(atomId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.truth?.frequency).toBe(0.6); // From MockTruthPolicy
  });
});
