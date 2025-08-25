import { Task } from './models';
import PriorityQueueLib from 'ts-priority-queue';
import { Mutex } from 'async-mutex';
import { IAttentionPolicy } from './interfaces';
import { EventBus } from '../gui/EventBus';
import { WorldModel } from './world-model';

export class Agenda {
  private queue: PriorityQueueLib<Task>;
  private tasks_map: Map<string, Task> = new Map();
  private mutex = new Mutex();
  private last_decay_timestamp: number;
  private pinned_tasks: Set<string> = new Set();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.queue = new PriorityQueueLib({
      comparator: (a: Task, b: Task) => b.attention.priority - a.attention.priority,
    });
    this.last_decay_timestamp = Date.now() / 1000;
  }

  /**
   * Safely drains the queue and returns all tasks.
   * This is the only reliable way to iterate over the contents of `ts-priority-queue`.
   * NOTE: This method leaves the queue empty.
   */
  private _drain_queue(): Task[] {
    const tasks: Task[] = [];
    while (this.queue.length > 0) {
      tasks.push(this.queue.dequeue());
    }
    return tasks;
  }

  async push(task: Task): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (this.tasks_map.has(task.id)) {
        return;
      }
      this.queue.queue(task);
      this.tasks_map.set(task.id, task);
      this.eventBus.emit('task_added_to_agenda', { task });
    } finally {
      release();
    }
  }

  async find_task_by_content(content: string, world_model: WorldModel): Promise<Task | undefined> {
    const release = await this.mutex.acquire();
    try {
        for (const task of this.tasks_map.values()) {
            const atom = world_model.get_atom(task.atom_id);
            if (atom && atom.content === content) {
                return task;
            }
        }
        return undefined;
    } finally {
        release();
    }
  }

  async pop(): Promise<Task> {
    const release = await this.mutex.acquire();
    try {
      if (this.queue.length === 0) {
        throw new Error("Agenda is empty.");
      }
      const task = this.queue.dequeue();
      this.tasks_map.delete(task.id);
      this.eventBus.emit('task_removed_from_agenda', { taskId: task.id });
      return task;
    } finally {
      release();
    }
  }

  async isEmpty(): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      return this.queue.length === 0;
    } finally {
      release();
    }
  }

  async size(): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      return this.queue.length;
    } finally {
      release();
    }
  }

  async peek(): Promise<Task | undefined> {
    const release = await this.mutex.acquire();
    try {
      return this.queue.length > 0 ? this.queue.peek() : undefined;
    } finally {
      release();
    }
  }

  async find(taskId: string): Promise<Task | undefined> {
    const release = await this.mutex.acquire();
    try {
      return this.tasks_map.get(taskId);
    } finally {
      release();
    }
  }

  async updatePriority(taskId: string, newPriority: number): Promise<void> {
    const release = await this.mutex.acquire();
    try {
        const task = this.tasks_map.get(taskId);
        if (task) {
            task.attention.priority = newPriority;

            const all_tasks = this._drain_queue();
            all_tasks.forEach(t => {
                if (t.id === taskId) {
                    this.queue.queue(task); // queue the updated task
                } else {
                    this.queue.queue(t);
                }
            });
            this.eventBus.emit('task_updated_in_agenda', { task });
        }
    } finally {
      release();
    }
  }

  async decay(attention_policy: IAttentionPolicy): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const now = Date.now() / 1000;
      const elapsed = now - this.last_decay_timestamp;
      if (elapsed <= 0) return;

      const all_tasks = this._drain_queue();
      const decayed_tasks: Task[] = [];

      for (const task of all_tasks) {
        if (!this.is_task_pinned(task.id)) {
            const new_attention = attention_policy.decay(task, elapsed);
            decayed_tasks.push({ ...task, attention: new_attention });
        } else {
            decayed_tasks.push(task);
        }
      }

      // Rebuild the priority queue and the map
      this.tasks_map.clear();
      decayed_tasks.forEach(t => {
        this.queue.queue(t);
        this.tasks_map.set(t.id, t);
      });

      this.last_decay_timestamp = now;
    } finally {
      release();
    }
  }

  pin_task(taskId: string) {
    const is_pinned = this.pinned_tasks.has(taskId);
    if (is_pinned) {
      this.pinned_tasks.delete(taskId);
    } else {
      this.pinned_tasks.add(taskId);
    }
    const task = this.tasks_map.get(taskId);
    if (task) {
        this.eventBus.emit('task_updated_in_agenda', { task });
    }
  }

  is_task_pinned(taskId: string): boolean {
    return this.pinned_tasks.has(taskId);
  }

  async get_all_tasks(): Promise<Task[]> {
    const release = await this.mutex.acquire();
    try {
      const all_tasks = this._drain_queue();
      // Re-queue them since this is a read-only operation
      all_tasks.forEach(t => this.queue.queue(t));
      return all_tasks;
    } finally {
      release();
    }
  }
}