import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InductionSchema } from '../../schemas/induction';
import { WorldModel } from '../../world-model';
import { Task, SemanticAtom } from '../../models';
import { TaskType, UUID } from '../../types';
import { DefaultTruthPolicy, DefaultResonanceStrategy, InMemoryPatternMatcher } from '../../implementations';
import { SchemaRegistry } from '../../schema-registry';
import { v4 as uuidv4 } from 'uuid';

describe('InductionSchema', () => {
  let world_model: WorldModel;
  let truth_policy: DefaultTruthPolicy;
  let induction_schema: InductionSchema;

  beforeEach(() => {
    const mockApp = { emit: vi.fn() };
    const resonance_strategy = new DefaultResonanceStrategy();
    truth_policy = new DefaultTruthPolicy();
    const pattern_matcher = new InMemoryPatternMatcher();
    const schema_registry = new SchemaRegistry(pattern_matcher);
    world_model = new WorldModel(mockApp as any, resonance_strategy, truth_policy, schema_registry, pattern_matcher);
    induction_schema = new InductionSchema();
  });

  const createTask = async (content: string): Promise<Task> => {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content,
      embedding: [],
    };
    await world_model.add_atom(atom);

    const task: Task = {
      id: uuidv4(),
      atom_id: atom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 0.9, confidence: 0.9 },
      attention: { priority: 0.8, durability: 0.8 },
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: 'user_input' },
    };
    await world_model.add_task(task);
    return task;
  };

  it('should induce a general rule from two specific beliefs with a common subject', async () => {
    const task_a = await createTask('(is_bird robin)');
    const task_b = await createTask('(can_fly robin)');

    const derived_tasks = await induction_schema.apply(task_a, task_b, truth_policy, world_model, {});

    expect(derived_tasks.length).toBe(1);
    const derived_task = derived_tasks[0];
    expect(derived_task.type).toBe(TaskType.BELIEF);

    const derived_atom = world_model.get_atom(derived_task.atom_id);
    expect(derived_atom.content).toBe('(implies (is_bird $X) (can_fly $X))');
  });

  it('should not induce a rule if there is no common term', async () => {
    const task_a = await createTask('(is_bird robin)');
    const task_b = await createTask('(is_mammal cat)');

    const derived_tasks = await induction_schema.apply(task_a, task_b, truth_policy, world_model, {});

    expect(derived_tasks.length).toBe(0);
  });

  it('should not induce a rule by generalizing on the predicate', async () => {
    const task_a = await createTask('(eats cat bird)');
    const task_b = await createTask('(eats dog food)');

    const derived_tasks = await induction_schema.apply(task_a, task_b, truth_policy, world_model, {});

    expect(derived_tasks.length).toBe(0);
  });

  it('should induce a rule from two beliefs with a common subject and different predicates', async () => {
    const task_a = await createTask('(eats cat bird)');
    const task_b = await createTask('(hunts cat mouse)');

    const derived_tasks = await induction_schema.apply(task_a, task_b, truth_policy, world_model, {});

    expect(derived_tasks.length).toBe(1);
    const derived_atom = world_model.get_atom(derived_tasks[0].atom_id);
    expect(derived_atom.content).toBe('(implies (eats $X bird) (hunts $X mouse))');
  });
});
