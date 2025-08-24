import { Task } from './models';
import PriorityQueueLib from 'ts-priority-queue';
import { Mutex } from 'async-mutex';

/**
 * A thread-safe priority queue for managing tasks.
 * It uses a heap-based priority queue for efficiency and a mutex to ensure
 * safe concurrent access from multiple worker threads.
 */
export class Agenda {
  private queue: PriorityQueueLib<Task>;
  private mutex = new Mutex();

  constructor() {
    this.queue = new PriorityQueueLib({
      // The comparator function orders tasks by priority in descending order.
      // Higher priority values are processed first.
      comparator: (a: Task, b: Task) => b.attention.priority - a.attention.priority,
    });
  }

  /**
   * Adds a task to the queue in a thread-safe manner.
   * @param task The task to add.
   */
  async push(task: Task): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.queue.queue(task);
    } finally {
      release();
    }
  }

  /**
   * Removes and returns the highest-priority task from the queue in a thread-safe manner.
   * @returns The highest-priority task.
   * @throws {Error} if the queue is empty.
   */
  async pop(): Promise<Task> {
    const release = await this.mutex.acquire();
    try {
      if (this.queue.length === 0) {
        throw new Error("Agenda is empty.");
      }
      return this.queue.dequeue();
    } finally {
      release();
    }
  }

  /**
   * Checks if the queue is empty in a thread-safe manner.
   * @returns True if the queue is empty, false otherwise.
   */
  async isEmpty(): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      return this.queue.length === 0;
    } finally {
      release();
    }
  }

  /**
   * Returns the number of tasks in the queue in a thread-safe manner.
   * @returns The number of tasks.
   */
  async size(): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      return this.queue.length;
    } finally {
      release();
    }
  }

  /**
   * Returns the highest-priority task without removing it from the queue, in a thread-safe manner.
   * @returns The highest-priority task, or undefined if the queue is empty.
   */
  async peek(): Promise<Task | undefined> {
    const release = await this.mutex.acquire();
    try {
      if (this.queue.length === 0) {
        return undefined;
      }
      return this.queue.peek();
    } finally {
      release();
    }
  }
}