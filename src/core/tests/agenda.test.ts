import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agenda } from '../agenda'; // Corrected import path
import { Task, AttentionValue, DerivationStamp } from '../models';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { DefaultAttentionPolicy } from '../implementations';

describe('Agenda (PriorityQueue)', () => {
  let agenda: Agenda;
  const mockApp = {
    emit: vi.fn(),
  };

  beforeEach(() => {
    agenda = new Agenda(mockApp as any);
    mockApp.emit.mockClear();
  });

  it('should be empty initially', async () => {
    expect(await agenda.isEmpty()).toBe(true);
  });

  it('should push and pop tasks in priority order (highest priority first)', async () => {
    const task1: Task = {
      id: uuidv4(),
      atom_id: uuidv4(),
      type: TaskType.GOAL,
      attention: { priority: 0.5, durability: 0.5 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    const task2: Task = {
      id: uuidv4(),
      atom_id: uuidv4(),
      type: TaskType.BELIEF,
      attention: { priority: 0.9, durability: 0.5 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
    const task3: Task = {
      id: uuidv4(),
      atom_id: uuidv4(),
      type: TaskType.QUESTION,
      attention: { priority: 0.2, durability: 0.5 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    await agenda.push(task1);
    await agenda.push(task3);
    await agenda.push(task2);

    expect(await agenda.isEmpty()).toBe(false);
    expect(await agenda.pop()).toEqual(task2); // Highest priority
    expect(await agenda.pop()).toEqual(task1); // Medium priority
    expect(await agenda.pop()).toEqual(task3); // Lowest priority
    expect(await agenda.isEmpty()).toBe(true);
  });

  it('should throw an error when popping from an empty agenda', async () => {
    await expect(agenda.pop()).rejects.toThrow("Agenda is empty.");
  });

  it('should decay the attention of tasks over time', async () => {
    const attention_policy = new DefaultAttentionPolicy();
    const initial_priority = 0.8;
    const task: Task = {
      id: uuidv4(),
      atom_id: uuidv4(),
      type: TaskType.GOAL,
      attention: { priority: initial_priority, durability: 0.8 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    await agenda.push(task);

    // Mock time to simulate passing time
    vi.useFakeTimers();
    vi.advanceTimersByTime(5000); // 5 seconds

    await agenda.decay(attention_policy);

    const decayed_task = await agenda.find(task.id);
    expect(decayed_task!.attention.priority).toBeLessThan(initial_priority);

    vi.useRealTimers();
  });

  it('should not decay the attention of pinned tasks', async () => {
    const attention_policy = new DefaultAttentionPolicy();
    const initial_priority = 0.8;
    const task: Task = {
      id: uuidv4(),
      atom_id: uuidv4(),
      type: TaskType.GOAL,
      attention: { priority: initial_priority, durability: 0.8 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    await agenda.push(task);
    agenda.pin_task(task.id);

    // Mock time
    vi.useFakeTimers();
    vi.advanceTimersByTime(5000);

    await agenda.decay(attention_policy);

    const undecayed_task = await agenda.find(task.id);
    expect(undecayed_task!.attention.priority).toBe(initial_priority);

    vi.useRealTimers();
  });
});