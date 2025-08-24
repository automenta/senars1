import { App } from './app';
import { Task } from './core/models';
import { TaskType } from './core/types';
import { WorldModel } from './core/world-model';
import { PriorityQueue } from './core/agenda';
import { SchemaRegistry } from './core/schema-registry';
import { is_procedure_task, extract_handler_name, extract_param } from './core/procedure';

export interface GuiTask extends Task {
  content: string;
  priority_text: string;
  related_to?: string;
  next_step?: string;
  created_ago?: string;
  retains_for?: string;
  path_history?: string;
  source?: string;
  completed_ago?: string;
  verification_status?: string;
  knowledge_retention?: string;
}

export class Gui {
  private world_model: WorldModel;
  private agenda: PriorityQueue;
  private schema_registry: SchemaRegistry;
  private app: App;

  private activeThoughtsList: HTMLElement;
  private completedThoughtsList: HTMLElement;
  private focusMetric: HTMLElement;
  private memoryMetric: HTMLElement;
  private energyMetric: HTMLElement;
  private newThoughtInput: HTMLInputElement;
  private addNewThoughtButton: HTMLElement;

  constructor(app: App, world_model: WorldModel, agenda: PriorityQueue, schema_registry: SchemaRegistry) {
    this.app = app;
    this.world_model = world_model;
    this.agenda = agenda;
    this.schema_registry = schema_registry;

    this.activeThoughtsList = document.getElementById('active-thoughts-list')!;
    this.completedThoughtsList = document.getElementById('completed-thoughts-list')!;
    this.focusMetric = document.getElementById('focus-metric')!;
    this.memoryMetric = document.getElementById('memory-metric')!;
    this.energyMetric = document.getElementById('energy-metric')!;
    this.newThoughtInput = document.getElementById('new-thought-input') as HTMLInputElement;
    this.addNewThoughtButton = document.getElementById('add-new-thought-button')!;
  }

  public init() {
    this.render();
    this.addNewThoughtButton.addEventListener('click', () => {
      const content = this.newThoughtInput.value.trim();
      if (content) {
        const type = content.endsWith('?') ? TaskType.GOAL : TaskType.BELIEF;
        this.app.add_new_thought(content, type);
        this.newThoughtInput.value = '';
        this.render();
      }
    });
  }

  public render() {
    const activeTasks = this.get_active_thoughts();
    const completedTasks = this.get_completed_thoughts();

    this.activeThoughtsList.innerHTML = activeTasks.map(t => this.renderThoughtCard(t, false)).join('');
    this.completedThoughtsList.innerHTML = completedTasks.map(t => this.renderThoughtCard(t, true)).join('');

    this.renderMetrics();
  }

  private get_time_ago(timestamp: number): string {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  }

  private get_retention_time = (durability: number): string =>
    durability > 0.8 ? 'Long' : durability > 0.5 ? 'Medium' : 'Short';

  private get_priority_text = (priority: number): string =>
    priority > 0.75 ? 'HIGH' : priority > 0.5 ? 'MEDIUM' : 'LOW';

  private map_task_to_gui_task(task: Task): GuiTask {
    const atom = this.world_model.get_atom(task.atom_id);
    const guiTask: GuiTask = {
      ...task,
      content: atom ? atom.content : 'Atom not found',
      priority_text: this.get_priority_text(task.attention.priority),
      created_ago: this.get_time_ago(task.stamp.timestamp),
      retains_for: this.get_retention_time(task.attention.durability),
      related_to: task.stamp.parent_ids.length > 0
        ? `Related to: ${task.stamp.parent_ids.map(id => {
            try {
              return this.world_model.get_atom(this.world_model.get_task(id).atom_id).content;
            } catch (e) {
              console.error(`Error fetching related task atom content for ID ${id}:`, e);
              return 'Unknown';
            }
          }).join(', ')}`
        : undefined,
      path_history: task.stamp.parent_ids.length > 0
        ? `Path: ${task.stamp.parent_ids.map(id => {
            try {
              return this.world_model.get_atom(this.world_model.get_task(id).atom_id).content;
            } catch (e) {
              console.error(`Error fetching path history task atom content for ID ${id}:`, e);
              return 'Unknown';
            }
          }).join(' → ')}`
        : undefined,
      source: task.stamp.schema_id
        ? (this.schema_registry.get(task.stamp.schema_id)?.get_trigger_pattern() || `Schema ID: ${task.stamp.schema_id}`)
        : undefined,
      completed_ago: task.type === TaskType.BELIEF ? this.get_time_ago(task.stamp.timestamp) : undefined,
      verification_status: task.type === TaskType.BELIEF ? 'Unverified' : undefined,
      knowledge_retention: task.type === TaskType.BELIEF ? this.get_retention_time(task.attention.durability) : undefined,
    };

    if (task.type === TaskType.GOAL && is_procedure_task(task, this.world_model)) {
      const handler_name = extract_handler_name(atom.content);
      const query = extract_param(atom.content, "query");
      guiTask.next_step = `Research toxicity (${handler_name} query: "${query || 'N/A'}")`;
    }

    return guiTask;
  }

  private get_active_thoughts(): GuiTask[] {
    return this.agenda['items'].map(item => this.map_task_to_gui_task(item.task));
  }

  private get_completed_thoughts(): GuiTask[] {
    return Array.from(this.world_model.tasks.values())
      .filter(task => task.type === TaskType.BELIEF)
      .map(t => this.map_task_to_gui_task(t));
  }

  private get_cognitive_metrics() {
    const activeTasks = this.agenda.size();
    const completedBeliefs = Array.from(this.world_model.tasks.values()).filter(task => task.type === TaskType.BELIEF).length;
    const totalTasks = activeTasks + completedBeliefs;
    const focusLevel = totalTasks > 0 ? ((activeTasks / totalTasks) * 100).toFixed(0) : 0;
    const memoryItems = completedBeliefs;
    const energyLevel = 78;

    return {
      focus: `${focusLevel}%`,
      active_thoughts: activeTasks,
      memory: `${memoryItems} items`,
      energy: `${energyLevel}%`,
    };
  }

  private getPriorityClass(priority: number): string {
    if (priority > 0.75) return 'priority-high';
    if (priority > 0.5) return 'priority-medium';
    return 'priority-low';
  }

  private getTaskIcon(taskType: TaskType, isCompleted: boolean): string {
    if (isCompleted) return '✅';
    switch (taskType) {
      case TaskType.GOAL: return '🎯';
      case TaskType.QUESTION: return '❓';
      case TaskType.BELIEF: return '💡';
      case TaskType.PROCEDURE: return '⚙️';
      case TaskType.QUEST: return '🗺️';
      default: return '💭';
    }
  }

  private renderThoughtCard(task: GuiTask, isCompleted: boolean): string {
    const priorityClass = isCompleted ? 'completed' : this.getPriorityClass(task.attention.priority);
    const icon = this.getTaskIcon(task.type, isCompleted);
    const confidence = `Confidence: ${((task.truth?.confidence ?? 0) * 100).toFixed(0)}%`;

    const details = isCompleted
      ? [
          `<p>• ${confidence}</p>`,
          `<p>• Source: ${task.source || 'N/A'} | Completed: ${task.completed_ago || 'N/A'}</p>`,
          task.path_history ? `<p>• Path: ${task.path_history}</p>` : '',
          `<p>• Verified by: ${task.verification_status || 'N/A'}</p>`,
          `<p>• Knowledge Retention: ${task.knowledge_retention || 'N/A'}</p>`,
        ]
      : [
          `<p>• Priority: <strong>${task.priority_text}</strong> | ${confidence}</p>`,
          task.related_to ? `<p>• Related to: ${task.related_to}</p>` : '',
          task.next_step ? `<p>• Next step: ${task.next_step}</p>` : '',
          `<p>• Created: ${task.created_ago || 'N/A'} | Retains for: ${task.retains_for || 'N/A'}</p>`,
          task.path_history ? `<p>• Path: ${task.path_history}</p>` : '',
        ];

    return `
      <div class="thought-card ${priorityClass}">
        <h4>${icon} [${task.priority_text}] ${task.content}</h4>
        ${details.filter(Boolean).join('')}
      </div>
    `;
  }

  private renderMetrics() {
    const metrics = this.get_cognitive_metrics();
    this.focusMetric.textContent = `${metrics.focus} (${metrics.active_thoughts} tasks)`;
    this.memoryMetric.textContent = metrics.memory;
    this.energyMetric.textContent = metrics.energy;
  }
}
