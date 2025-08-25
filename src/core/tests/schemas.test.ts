import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeductionSchema } from '../schemas';
import { Task, SemanticAtom, AttentionValue, DerivationStamp, TruthValue } from '../models';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockTruthPolicy, MockResonanceStrategy } from './world-model.test'; // Reusing mocks
import { WorldModel } from '../world-model';
import { InMemoryPatternMatcher } from '../implementations';
import { SchemaRegistry } from '../schema-registry';

describe('DeductionSchema', () => {
  let deductionSchema: DeductionSchema;
  let mockTruthPolicy: MockTruthPolicy;
  let worldModel: WorldModel;
  const mockApp = {
    emit: vi.fn(),
  };

  beforeEach(() => {
    deductionSchema = new DeductionSchema();
    mockTruthPolicy = new MockTruthPolicy();
    const resonanceStrategy = new MockResonanceStrategy();
    const schemaRegistry = new SchemaRegistry(new InMemoryPatternMatcher());
    worldModel = new WorldModel(mockApp as any, resonanceStrategy, mockTruthPolicy, schemaRegistry, new InMemoryPatternMatcher());
    mockApp.emit.mockClear();
  });

  it('should return the correct trigger pattern', () => {
    expect(deductionSchema.get_trigger_pattern()).toEqual(['(implies $P $Q)', '($P)']);
  });

  it('should apply the schema and derive a new belief', async () => {
    const premiseAtom: SemanticAtom = {
      id: "premise_atom_id",
      content: '(eats cat chocolate)',
      embedding: [],
    };
    const implicationAtom: SemanticAtom = {
      id: "implication_atom_id",
      content: '(implies (eats cat chocolate) (is_sick cat))',
      embedding: [],
    };
    await worldModel.add_atom(premiseAtom);
    await worldModel.add_atom(implicationAtom);

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

    const pattern_bindings = { '$P': '(eats cat chocolate)', '$Q': '(is_sick cat)' };
    const derivedTasks = await deductionSchema.apply(taskA, taskB, mockTruthPolicy, worldModel, pattern_bindings);

    expect(derivedTasks.length).toBe(1);
    const derivedTask = derivedTasks[0];
    const derivedAtom = worldModel.get_atom(derivedTask.atom_id);
    expect(derivedTask.type).toBe(TaskType.BELIEF);
    expect(derivedAtom.content).toBe('(is_sick cat)');
    expect(derivedTask.stamp.schema_id).toBe(deductionSchema.id);
    expect(derivedTask.truth).toEqual({ frequency: 0.7, confidence: 0.7 }); // From MockTruthPolicy
  });

  it('should apply with bindings', async () => {
    const premiseAtom: SemanticAtom = {
      id: "premise_atom_id",
      content: '(eats cat chocolate)',
      embedding: [],
    };
    const implicationAtom: SemanticAtom = {
      id: "implication_atom_id",
      content: '(implies (eats cat chocolate) (is_sick %who))', // Using a scope variable
      embedding: [],
    };
    await worldModel.add_atom(premiseAtom);
    await worldModel.add_atom(implicationAtom);

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
    const scope_bindings = { '%who': 'cat' };
    const pattern_bindings = { '$P': '(eats cat chocolate)', '$Q': '(is_sick %who)' };


    const derivedTasks = await deductionSchema.apply_with_bindings(taskA, taskB, mockTruthPolicy, scope_bindings, worldModel, pattern_bindings);

    expect(derivedTasks.length).toBe(1);
    const derivedTask = derivedTasks[0];
    const derivedAtom = worldModel.get_atom(derivedTask.atom_id);
    expect(derivedAtom.content).toBe('(is_sick cat)');
  });
});
