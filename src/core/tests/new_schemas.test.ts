import { describe, it, expect, beforeEach } from 'vitest';
import { AbductionSchema } from '../schemas/abduction';
import { InductionSchema } from '../schemas/induction';
import { Task, SemanticAtom } from '../models';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockTruthPolicy, MockResonanceStrategy } from './world-model.test';
import { WorldModel } from '../world-model';

describe('AbductionSchema', () => {
  let abductionSchema: AbductionSchema;
  let mockTruthPolicy: MockTruthPolicy;
  let worldModel: WorldModel;

  beforeEach(() => {
    abductionSchema = new AbductionSchema();
    mockTruthPolicy = new MockTruthPolicy();
    const resonanceStrategy = new MockResonanceStrategy();
    worldModel = new WorldModel(resonanceStrategy, mockTruthPolicy);
  });

  it('should derive the premise from an implication and a conclusion', () => {
    const conclusionAtom: SemanticAtom = { id: "conclusion_atom", content: '(is_sick cat)', embedding: [] };
    const implicationAtom: SemanticAtom = { id: "implication_atom", content: '(implies (eats cat chocolate) (is_sick cat))', embedding: [] };
    worldModel.add_atom(conclusionAtom);
    worldModel.add_atom(implicationAtom);

    const taskA: Task = { id: uuidv4(), atom_id: implicationAtom.id, type: TaskType.BELIEF, truth: { frequency: 1.0, confidence: 1.0 }, attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' } };
    const taskB: Task = { id: uuidv4(), atom_id: conclusionAtom.id, type: TaskType.BELIEF, truth: { frequency: 0.8, confidence: 0.7 }, attention: { priority: 0.8, durability: 0.7 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' } };

    const derivedTasks = abductionSchema.apply(taskA, taskB, mockTruthPolicy, worldModel);

    expect(derivedTasks.length).toBe(1);
    const derivedAtom = worldModel.get_atom(derivedTasks[0].atom_id);
    expect(derivedAtom.content).toBe('(eats cat chocolate)');
  });
});

describe('InductionSchema', () => {
  let inductionSchema: InductionSchema;
  let mockTruthPolicy: MockTruthPolicy;
  let worldModel: WorldModel;

  beforeEach(() => {
    inductionSchema = new InductionSchema();
    mockTruthPolicy = new MockTruthPolicy();
    const resonanceStrategy = new MockResonanceStrategy();
    worldModel = new WorldModel(resonanceStrategy, mockTruthPolicy);
  });

  it('should induce an implication from two co-occurring facts', () => {
    const fact1Atom: SemanticAtom = { id: "fact1_atom", content: '(eats cat chocolate)', embedding: [] };
    const fact2Atom: SemanticAtom = { id: "fact2_atom", content: '(is_sick cat)', embedding: [] };
    worldModel.add_atom(fact1Atom);
    worldModel.add_atom(fact2Atom);

    const taskA: Task = { id: uuidv4(), atom_id: fact1Atom.id, type: TaskType.BELIEF, truth: { frequency: 0.8, confidence: 0.7 }, attention: { priority: 0.8, durability: 0.7 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' } };
    const taskB: Task = { id: uuidv4(), atom_id: fact2Atom.id, type: TaskType.BELIEF, truth: { frequency: 0.9, confidence: 0.9 }, attention: { priority: 0.9, durability: 0.9 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' } };

    const derivedTasks = inductionSchema.apply(taskA, taskB, mockTruthPolicy, worldModel);

    expect(derivedTasks.length).toBe(1);
    const derivedAtom = worldModel.get_atom(derivedTasks[0].atom_id);
    expect(derivedAtom.content).toBe('(implies (eats $X chocolate) (is_sick $X))');
  });
});
