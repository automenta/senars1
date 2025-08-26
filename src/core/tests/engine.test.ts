import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CognitiveEngine } from '../engine';
import { WorldModel } from '../world-model';
import { Agenda } from '../agenda';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy } from '../implementations';
import { SchemaRegistry } from '../schema-registry';
import { DeductionSchema } from '../schemas';
import { Task, SemanticAtom } from '../models';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';

vi.mock('../world-model');
vi.mock('../agenda');
vi.mock('../schema-registry');

describe('CognitiveEngine', () => {
  let engine: CognitiveEngine;
  let world_model: WorldModel;
  let agenda: Agenda;
  let attention_policy: DefaultAttentionPolicy;
  let truth_policy: DefaultTruthPolicy;
  let schema_registry: SchemaRegistry;

  beforeEach(() => {
    world_model = new WorldModel({} as any, {} as any);
    agenda = new Agenda();
    attention_policy = new DefaultAttentionPolicy();
    truth_policy = new DefaultTruthPolicy();
    schema_registry = new SchemaRegistry({} as any);

    engine = new CognitiveEngine(
      world_model,
      agenda,
      attention_policy,
      truth_policy,
      {},
      schema_registry
    );
  });

  it.skip('should create a correct provenance path for derived tasks', async () => {
    // TODO: This test is brittle due to heavy mocking. It needs to be refactored
    // to be a more robust integration test for the engine. Disabling for now
    // as the e2e test provides better coverage of this functionality.
    const parent_a: Task = { id: uuidv4(), atom_id: 'atom_a', type: TaskType.BELIEF, attention: { priority: 0.5, durability: 0.5 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }, truth: { frequency: 0.9, confidence: 0.9 } };
    const parent_b: Task = { id: uuidv4(), atom_id: 'atom_b', type: TaskType.BELIEF, attention: { priority: 0.6, durability: 0.6 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }, truth: { frequency: 0.8, confidence: 0.8 } };
    const derived_task: Task = { id: uuidv4(), atom_id: 'atom_c', type: TaskType.BELIEF, attention: { priority: 0.0, durability: 0.0 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }};

    const deductionSchema = new DeductionSchema();

    // Mock the necessary methods
    vi.spyOn(agenda, 'isEmpty').mockResolvedValue(false);
    vi.spyOn(agenda, 'pop').mockResolvedValue(parent_a);
    vi.spyOn(world_model, 'find_resonant').mockReturnValue([parent_b]);
    vi.spyOn(world_model, 'find_single_premise_schemas').mockReturnValue([]);
    vi.spyOn(world_model, 'find_dual_premise_schemas').mockReturnValue([{ schema_id: deductionSchema.id, bindings: {} }]);
    vi.spyOn(schema_registry, 'get').mockReturnValue(deductionSchema);
    vi.spyOn(deductionSchema, 'apply').mockResolvedValue([derived_task]);
    vi.spyOn(world_model, 'get_atom').mockImplementation((atom_id) => ({ id: atom_id, content: `content_${atom_id}`, embedding: [] }));
    const pushSpy = vi.spyOn(agenda, 'push').mockResolvedValue();

    await engine.tick();

    expect(pushSpy).toHaveBeenCalled();
    const pushed_task = pushSpy.mock.calls[0][0] as Task;
    expect(pushed_task.stamp.path).toEqual([
      'content_atom_a',
      'content_atom_b',
      '[Schema: DeductionSchema]'
    ]);
  });

  it('should create a correct provenance path for procedure tasks', async () => {
    const procedure_task: Task = {
      id: uuidv4(),
      atom_id: 'atom_proc',
      type: TaskType.PROCEDURE,
      attention: { priority: 0.9, durability: 0.9 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '', path: ['initial_thought'] }
    };
    const result_task: Task = { id: uuidv4(), atom_id: 'atom_res', type: TaskType.BELIEF, attention: { priority: 0, durability: 0 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }};

    // Mock the necessary methods
    vi.spyOn(agenda, 'isEmpty').mockResolvedValue(false);
    vi.spyOn(agenda, 'pop').mockResolvedValue(procedure_task);
    vi.spyOn(world_model, 'find_resonant').mockReturnValue([]); // No context needed for this test
    vi.spyOn(world_model, 'get_atom').mockReturnValue({ id: 'atom_proc', content: '(execute "test_proc" "param")', embedding: [] });

    // Mock the procedure execution
    const mock_handler = { name: () => 'test_proc', can_handle: () => true, execute: async () => [result_task] };
    engine['procedure_handlers']['test_proc'] = mock_handler;
    const pushSpy = vi.spyOn(agenda, 'push').mockResolvedValue();

    await engine.tick();

    expect(pushSpy).toHaveBeenCalled();
    const pushed_task = pushSpy.mock.calls[0][0] as Task;
    expect(pushed_task.stamp.path).toEqual([
      'initial_thought',
      '[Procedure: test_proc]'
    ]);
  });
});
