import { describe, it, expect, beforeEach } from 'vitest';
import { WorldModel } from '../world-model';
import { SemanticAtom, Task } from '../models';
import { IResonanceStrategy, ITruthPolicy } from '../interfaces';
import { InMemoryPatternMatcher } from '../implementations';
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

  const create_atom = (content: string): SemanticAtom => ({
    id: uuidv4(),
    content,
    embedding: [1, 2, 3],
    meta: {},
  });

  const create_task = (atom_id: UUID, type: 'BELIEF' | 'GOAL' = 'BELIEF'): Task => ({
    id: uuidv4(),
    atom_id,
    type,
    truth: type === 'BELIEF' ? { frequency: 1, confidence: 0.9 } : undefined,
    attention: { priority: 0.8, durability: 0.5 },
    stamp: { timestamp: Date.now(), parent_ids: [], schema_id: '', scope_bindings: {} },
  });

  beforeEach(() => {
    resonanceStrategy = new MockResonanceStrategy();
    truthPolicy = new MockTruthPolicy();
    worldModel = new WorldModel(resonanceStrategy, truthPolicy, new InMemoryPatternMatcher());
  });

  it('should add and retrieve an atom', async () => {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: '(test atom)',
      embedding: [0.1],
    };
    await worldModel.add_atom(atom);
    const retrieved = worldModel.get_atom(atom.id);
    expect(retrieved).toEqual(atom);
  });

  it('should add and retrieve a task', async () => {
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
    await worldModel.add_task(task);
    const retrieved = worldModel.get_task(task.id);
    expect(retrieved).toEqual(task);
  });

  it('should handle belief revision', async () => {
    const atomId = uuidv4();
    const atom: SemanticAtom = { id: atomId, content: '(test)', embedding: [] };
    await worldModel.add_atom(atom);

    const belief1: Task = {
      id: uuidv4(),
      atom_id: atomId,
      type: TaskType.BELIEF,
      truth: { frequency: 0.5, confidence: 0.5 },
      attention: { priority: 0.5, durability: 0.5 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    await worldModel.add_task(belief1);

    const belief2: Task = {
      id: uuidv4(),
      atom_id: atomId,
      type: TaskType.BELIEF,
      truth: { frequency: 0.7, confidence: 0.7 },
      attention: { priority: 0.7, durability: 0.7 },
      stamp: { timestamp: 1, parent_ids: [], schema_id: '' },
    };
    await worldModel.add_task(belief2);

    const retrieved = worldModel.find_belief(atomId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.truth?.frequency).toBe(0.6); // From MockTruthPolicy
  });

  describe('remove_task', () => {
    it('should not throw an error when removing a non-existent task', async () => {
      await expect(worldModel.remove_task(uuidv4())).resolves.not.toThrow();
    });

    it('should remove a task and its associated atom if it is the only task using it', async () => {
      const atom = create_atom('test atom');
      const task = create_task(atom.id);

      await worldModel.add_atom(atom);
      await worldModel.add_task(task);

      expect(worldModel.tasks[task.id]).toBeDefined();
      expect(worldModel.atoms[atom.id]).toBeDefined();

      await worldModel.remove_task(task.id);

      expect(worldModel.tasks[task.id]).toBeUndefined();
      expect(worldModel.atoms[atom.id]).toBeUndefined();
    });

    it('should update a belief task instead of adding a new one with the same atom', async () => {
      const atom = create_atom('shared belief');
      const task1 = create_task(atom.id, 'BELIEF');
      task1.attention.priority = 0.5;
      const task2 = create_task(atom.id, 'BELIEF');
      task2.attention.priority = 0.8;

      await worldModel.add_atom(atom);
      await worldModel.add_task(task1);
      await worldModel.add_task(task2);

      // Check that only one task (the first one) is in the world model
      expect(Object.values(worldModel.tasks).length).toBe(1);
      expect(worldModel.tasks[task1.id]).toBeDefined();
      expect(worldModel.tasks[task2.id]).toBeUndefined();

      // Check that the existing task has been updated with the new attention value
      expect(worldModel.tasks[task1.id].attention.priority).toBe(0.8);
    });

    it('should remove a task but not its atom if the atom is used by another task of a different type', async () => {
      const atom = create_atom('shared atom');
      const task1 = create_task(atom.id, 'BELIEF');
      const task2 = create_task(atom.id, 'GOAL');

      await worldModel.add_atom(atom);
      await worldModel.add_task(task1);
      await worldModel.add_task(task2);

      expect(worldModel.tasks[task1.id]).toBeDefined();
      expect(worldModel.tasks[task2.id]).toBeDefined();
      expect(worldModel.atoms[atom.id]).toBeDefined();

      await worldModel.remove_task(task1.id);

      expect(worldModel.tasks[task1.id]).toBeUndefined();
      expect(worldModel.tasks[task2.id]).toBeDefined();
      expect(worldModel.atoms[atom.id]).toBeDefined();
    });

    it('should remove schema from schema_index when the last associated task is removed', async () => {
      // 1. Create a schema atom and a task for it
      const schemaPattern = '(implies $1 $2)';
      const schemaAtom: SemanticAtom = {
        id: uuidv4(),
        content: schemaPattern,
        embedding: [0.5],
      };
      await worldModel.add_atom(schemaAtom);

      const schemaTask: Task = {
        id: uuidv4(),
        atom_id: schemaAtom.id,
        type: TaskType.BELIEF,
        attention: { priority: 0.9, durability: 0.9 },
        stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' },
      };
      await worldModel.add_task(schemaTask);

      // 2. Verify the schema is in the schema_index
      expect(worldModel.schema_index.has(schemaPattern, schemaAtom.id)).toBe(true);

      // 3. Remove the task
      await worldModel.remove_task(schemaTask.id);

      // 4. Verify the schema is no longer in the schema_index and the atom is gone
      expect(worldModel.schema_index.has(schemaPattern, schemaAtom.id)).toBe(false);
      expect(worldModel.atoms[schemaAtom.id]).toBeUndefined();
    });

    it('should remove parent_id references from child tasks when a parent task is removed', async () => {
      // 1. Create a parent and child task
      const parentAtom = create_atom('parent');
      const parentTask = create_task(parentAtom.id);
      await worldModel.add_atom(parentAtom);
      await worldModel.add_task(parentTask);

      const childAtom = create_atom('child');
      const childTask = create_task(childAtom.id);
      childTask.stamp.parent_ids = [parentTask.id]; // Link child to parent
      await worldModel.add_atom(childAtom);
      await worldModel.add_task(childTask);

      // 2. Verify the link exists
      expect(worldModel.tasks[childTask.id].stamp.parent_ids).toContain(parentTask.id);

      // 3. Remove the parent task
      await worldModel.remove_task(parentTask.id);

      // 4. Verify the link is gone
      expect(worldModel.tasks[childTask.id].stamp.parent_ids).not.toContain(parentTask.id);
      expect(worldModel.tasks[childTask.id].stamp.parent_ids).toEqual([]);
    });
  });
});
