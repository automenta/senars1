import { describe, it, expect, beforeEach } from 'vitest';
import { DeductionSchema } from '../schemas';
import { Task, SemanticAtom, AttentionValue, DerivationStamp, TruthValue } from '../models';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockTruthPolicy, MockResonanceStrategy } from './world-model.test'; // Reusing mocks
import { WorldModel } from '../world-model';

describe('DeductionSchema', () => {
  let deductionSchema: DeductionSchema;
  let mockTruthPolicy: MockTruthPolicy;
  let worldModel: WorldModel;

  beforeEach(() => {
    deductionSchema = new DeductionSchema();
    mockTruthPolicy = new MockTruthPolicy();
    const resonanceStrategy = new MockResonanceStrategy();
    worldModel = new WorldModel(resonanceStrategy, mockTruthPolicy);
  });

  it('should return the correct trigger pattern', () => {
    expect(deductionSchema.get_trigger_pattern()).toBe('(implies $PREMISE $CONCLUSION)');
  });

  it('should apply the schema and derive a new belief', () => {
    const premiseAtom: SemanticAtom = {
      id: "premise_atom_id",
      content: '(eats cat chocolate)',
      embedding: [],
    };
    const implicationAtom: SemanticAtom = {
      id: "implication_atom_id",
      content: '(implies (eats $1 $2) (is_sick $1))',
      embedding: [],
    };
    worldModel.add_atom(premiseAtom);
    worldModel.add_atom(implicationAtom);

    const taskA: Task = { // Implication
      id: uuidv4(),
      atom_id: implicationAtom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 1.0, confidence: 1.0 },
      attention: { priority: 1, durability: 1 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    const taskB: Task = { // Premise
      id: uuidv4(),
      atom_id: premiseAtom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 0.8, confidence: 0.7 },
      attention: { priority: 0.8, durability: 0.7 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    const derivedTasks = deductionSchema.apply(taskA, taskB, mockTruthPolicy, worldModel);

    expect(derivedTasks.length).toBe(1);
    const derivedTask = derivedTasks[0];
    const derivedAtom = worldModel.get_atom(derivedTask.atom_id);
    expect(derivedTask.type).toBe(TaskType.BELIEF);
    expect(derivedAtom.content).toBe('(is_sick cat)');
    expect(derivedTask.stamp.schema_id).toBe(deductionSchema.id);
    expect(derivedTask.truth).toEqual({ frequency: 0.7, confidence: 0.7 }); // From MockTruthPolicy
  });

  it('should apply with bindings', () => {
    const premiseAtom: SemanticAtom = {
      id: "premise_atom_id",
      content: '(eats cat chocolate)',
      embedding: [],
    };
    const implicationAtom: SemanticAtom = {
      id: "implication_atom_id",
      content: '(implies (eats $1 $2) (is_sick %who))', // Using a scope variable
      embedding: [],
    };
    worldModel.add_atom(premiseAtom);
    worldModel.add_atom(implicationAtom);

    const taskA: Task = { // Implication
      id: uuidv4(),
      atom_id: implicationAtom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 1.0, confidence: 1.0 },
      attention: { priority: 1, durability: 1 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    const taskB: Task = { // Premise
      id: uuidv4(),
      atom_id: premiseAtom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 0.8, confidence: 0.7 },
      attention: { priority: 0.8, durability: 0.7 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    const bindings = { '%who': 'cat' };

    const derivedTasks = deductionSchema.apply_with_bindings(taskA, taskB, mockTruthPolicy, bindings, worldModel);

    expect(derivedTasks.length).toBe(1);
    const derivedTask = derivedTasks[0];
    const derivedAtom = worldModel.get_atom(derivedTask.atom_id);
    expect(derivedAtom.content).toBe('(is_sick cat)');
  });
});
