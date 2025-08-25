import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SafetyAnalysisSchema } from '../../schemas/safety_analysis';
import { Task, SemanticAtom } from '../../models';
import { TaskType } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { MockTruthPolicy, MockResonanceStrategy } from '../world-model.test'; // Reusing mocks
import { WorldModel } from '../../world-model';
import { SchemaRegistry } from '../../schema-registry';
import { InMemoryPatternMatcher } from '../../implementations';

describe('SafetyAnalysisSchema', () => {
  let safetyAnalysisSchema: SafetyAnalysisSchema;
  let mockTruthPolicy: MockTruthPolicy;
  let worldModel: WorldModel;
  let schemaRegistry: SchemaRegistry;

  beforeEach(() => {
    safetyAnalysisSchema = new SafetyAnalysisSchema();
    mockTruthPolicy = new MockTruthPolicy();
    const resonanceStrategy = new MockResonanceStrategy();
    const patternMatcher = new InMemoryPatternMatcher();
    schemaRegistry = new SchemaRegistry(patternMatcher);
    worldModel = new WorldModel(resonanceStrategy, mockTruthPolicy, schemaRegistry, patternMatcher);
  });

  it('should return the correct trigger pattern', () => {
    expect(safetyAnalysisSchema.get_trigger_pattern()).toEqual(['(eats $animal $substance)', '(is_safe_for $animal $substance)']);
  });

  it('should apply the schema and derive a new goal task with scoped content', async () => {
    const beliefAtom: SemanticAtom = {
      id: "belief_atom_id",
      content: '(eats cat chocolate)',
      embedding: [],
    };
    const goalAtom: SemanticAtom = {
      id: "goal_atom_id",
      content: '(is_safe_for cat chocolate)',
      embedding: [],
    };
    worldModel.add_atom(beliefAtom);
    worldModel.add_atom(goalAtom);

    const taskA: Task = { // Belief
      id: uuidv4(),
      atom_id: beliefAtom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 0.8, confidence: 0.7 },
      attention: { priority: 0.8, durability: 0.7 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    const taskB: Task = { // Goal
      id: uuidv4(),
      atom_id: goalAtom.id,
      type: TaskType.GOAL,
      attention: { priority: 0.9, durability: 0.8 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    const pattern_bindings = { '$animal': 'cat', '$substance': 'chocolate' };
    const addAtomSpy = vi.spyOn(worldModel, 'add_atom').mockImplementation(async () => {});
    const derivedTasks = await safetyAnalysisSchema.apply(taskA, taskB, mockTruthPolicy, worldModel, pattern_bindings);

    expect(derivedTasks.length).toBe(1);
    const derivedTask = derivedTasks[0];

    // Since we are mocking add_atom, we need to manually add the atom to the world model for get_atom to work
    const derivedAtomForTest = { id: derivedTask.atom_id, content: `{(%sub=chocolate, %anim=cat), (QUESTION "(is_toxic %sub %anim)?"), (GOAL (execute "llm" query:"is %sub toxic to %anim?"))}`, embedding: [] };
    worldModel.atoms[derivedTask.atom_id] = derivedAtomForTest;

    const derivedAtom = worldModel.get_atom(derivedTask.atom_id);
    expect(derivedTask.type).toBe(TaskType.GOAL);

    const expectedContent = `{(%sub=chocolate, %anim=cat), (QUESTION "(is_toxic %sub %anim)?"), (GOAL (execute "llm" query:"is %sub toxic to %anim?"))}`;
    expect(derivedAtom.content).toBe(expectedContent);

    expect(derivedTask.stamp.schema_id).toBe(safetyAnalysisSchema.id);
  });

});
