import { Task } from './models';
import { UUID } from './types';

export interface AgendaItem {
  task: Task;
  priority: number;
}

export class PriorityQueue {
  private items: AgendaItem[] = [];

  push(task: Task): void {
    // For now, priority is simply task.attention.priority
    const newItem: AgendaItem = { task, priority: task.attention.priority };
    this.items.push(newItem);
    this.items.sort((a, b) => b.priority - a.priority); // Sort in descending order of priority
  }

  pop(): Task {
    if (this.isEmpty()) {
      throw new Error("Agenda is empty.");
    }
    const item = this.items.shift();
    if (!item) {
      throw new Error("Failed to pop item from Agenda.");
    }
    return item.task;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  peek(): Task | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    return this.items[0].task;
  }
}