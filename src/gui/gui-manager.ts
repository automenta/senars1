import { App } from '../app';
import { Task, SemanticAtom } from '../core/models';
import { TaskType } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { generate_embedding } from '../core/utils';

import { EventBus } from './EventBus';

export class GuiManager {
  private app: App;
  private eventBus: EventBus;

  constructor(app: App) {
    this.app = app;
    this.eventBus = app.get_event_bus();
  }

  // All methods below are for GUI interaction and state management
  public async add_new_thought(content: string, type: TaskType = TaskType.GOAL) {
    // First, check if a task with this exact content already exists in the agenda
    const existing_task = await this.app.agenda.find_task_by_content(content, this.app.world_model);
    if (existing_task) {
        console.log(`Task with content "${content}" already exists in the agenda. Aborting.`);
        // Optional: give the existing task a small boost
        this.boost_task(existing_task.id);
        return;
    }

    // Check if an atom with this content already exists
    let atom = this.app.world_model.find_atom_by_content(content);

    if (!atom) {
      // If not, create a new one
      atom = {
        id: uuidv4(),
        content: content,
        embedding: generate_embedding(content),
      };
      this.app.world_model.add_atom(atom);
    }

    const newTask: Task = {
      id: uuidv4(),
      atom_id: atom.id, // Use the ID of the existing or new atom
      type: type,
      attention: this.app.get_attention_policy().calculate_initial({} as Task),
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [],
        schema_id: uuidv4(),
        source: 'user', // Tag task as originating from the user
      },
    };

    if (type === TaskType.BELIEF) {
      newTask.truth = { frequency: 0.7, confidence: 0.7 };
    }

    await this.app.agenda.push(newTask);
    console.log(`Added new thought: "${content}" as ${type}`);
  }

  public async boost_task(taskId: string) {
    const task = await this.app.agenda.find(taskId);
    if (task) {
      task.attention.priority = Math.min(1.0, task.attention.priority + 0.1);
      task.attention.durability = Math.min(1.0, task.attention.durability + 0.1);

      if (task.type === TaskType.BELIEF && task.truth) {
        task.truth.confidence = Math.min(1.0, task.truth.confidence + 0.1);
      }

      await this.app.agenda.updatePriority(taskId, task.attention.priority);
    }
  }

  public async reduce_task_priority(taskId: string) {
    const task = await this.app.agenda.find(taskId);
    if (task) {
      task.attention.priority = Math.max(0.0, task.attention.priority - 0.1);
      task.attention.durability = Math.max(0.0, task.attention.durability - 0.1);
      await this.app.agenda.updatePriority(taskId, task.attention.priority);
    }
  }

  public pin_task(taskId: string) {
    this.app.agenda.pin_task(taskId);
  }

  public is_task_pinned(taskId: string): boolean {
    return this.app.agenda.is_task_pinned(taskId);
  }

  public async star_belief(taskId: string) {
    const task = this.app.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
      task.attention.priority = Math.min(1.0, task.attention.priority + 0.2);
      task.attention.durability = Math.min(1.0, task.attention.durability + 0.2);
      await this.app.agenda.push(task);
    }
  }

  public question_belief(taskId: string) {
    const task = this.app.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
      const atom = this.app.world_model.get_atom(task.atom_id);
      this.add_new_thought(`${atom.content}?`, TaskType.GOAL);
    }
  }

  public forget_belief(taskId: string) {
    const task = this.app.world_model.tasks[taskId];
    if (task) {
      this.app.world_model.remove_task(taskId);
    }
  }

  public verify_belief(taskId: string) {
    const task = this.app.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
      task.verified = true;
      // Optionally, boost confidence of verified beliefs
      if (task.truth) {
        task.truth.confidence = Math.min(1.0, task.truth.confidence + 0.1);
      }
    }
  }

  public dispute_belief(taskId: string) {
    const task = this.app.world_model.tasks[taskId];
    if (task && task.type === TaskType.BELIEF) {
        task.verified = false; // Mark as disputed
        if (task.truth) {
            task.truth.confidence = Math.max(0.0, task.truth.confidence - 0.2);
        }
        task.attention.durability = Math.max(0.0, task.attention.durability - 0.2);
    }
  }

  public on(eventName:string, callback: Function) {
    this.eventBus.on(eventName, callback);
  }

  public emit(eventName: string, data: any) {
    this.eventBus.emit(eventName, data);
  }

  public get_llm_config() {
      return this.app.get_config().llm;
  }

  public update_llm_config(config: any) {
      this.app.update_llm_config(config);
  }
}
