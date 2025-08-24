import { Task } from './models';
import PriorityQueueLib from 'ts-priority-queue';
import { Mutex } from 'async-mutex';
import { IAttentionPolicy } from './interfaces';

export class Agenda {
  private queue: PriorityQueueLib<Task>;
  private tasks_map: Map<string, Task> = new Map();
  private mutex = new Mutex();
  private last_decay_timestamp: number;
  private pinned_tasks: Set<string> = new Set();

  constructor() {
    this.queue = new PriorityQueueLib({
      comparator: (a: Task, b: Task) => b.attention.priority - a.attention.priority,
    });
    this.last_decay_timestamp = Date.now() / 1000;
  }

  async push(task: Task): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.queue.queue(task);
      this.tasks_map.set(task.id, task);
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
            // Re-insert to update priority
            const newQueue = new PriorityQueueLib({
                comparator: (a: Task, b: Task) => b.attention.priority - a.attention.priority,
            });
            this.queue.toArray().forEach(t => {
                if (t.id === taskId) {
                    newQueue.queue(task);
                } else {
                    newQueue.queue(t);
                }
            });
            this.queue = newQueue;
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

      const tasksToRebuild: Task[] = [];
      for (const task of this.tasks_map.values()) {
        if (!this.is_task_pinned(task.id)) {
            task.attention = attention_policy.decay(task, elapsed);
        }
        tasksToRebuild.push(task);
      }

      // Rebuild the priority queue
      const newQueue = new PriorityQueueLib({
        comparator: (a: Task, b: Task) => b.attention.priority - a.attention.priority,
      });
      tasksToRebuild.forEach(t => newQueue.queue(t));
      this.queue = newQueue;

      this.last_decay_timestamp = now;
    } finally {
      release();
    }
  }

  pin_task(taskId: string) {
    if (this.pinned_tasks.has(taskId)) {
      this.pinned_tasks.delete(taskId);
    } else {
      this.pinned_tasks.add(taskId);
    }
  }

  is_task_pinned(taskId: string): boolean {
    return this.pinned_tasks.has(taskId);
  }

  async get_all_tasks(): Promise<Task[]> {
    const release = await this.mutex.acquire();
    try {
      // The 'ts-priority-queue' library does not have a public 'toArray' method.
      // We access the internal heap array for read-only purposes.
      // This is a potential point of failure if the library changes its internal structure.
      const internal_heap = (this.queue as any).heap;
      return internal_heap ? [...internal_heap] : [];
    } finally {
      release();
    }
  }
}