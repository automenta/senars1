import Hammer from 'hammerjs';
import { App } from './app';
import { Task } from './core/models';
import { TaskType } from './core/types';
import { WorldModel } from './core/world-model';
import { Agenda } from './core/agenda';
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
  private agenda: Agenda;
  private schema_registry: SchemaRegistry;
  private app: App;

  private activeThoughtsList: HTMLElement;
  private completedThoughtsList: HTMLElement;
  private schemaList: HTMLElement;
  private scopeDebugger: HTMLElement;
  private focusMetric: HTMLElement;
  private memoryMetric: HTMLElement;
  private energyMetric: HTMLElement;
  private newThoughtInput: HTMLInputElement;
  private addNewThoughtButton: HTMLElement;
  private settingsBtn: HTMLElement;
  private settingsModal: HTMLElement;
  private closeModalBtn: HTMLElement;
  private userModeSelect: HTMLSelectElement;
  private container: HTMLElement;
  private currentMode: string = 'thinking';

  constructor(app: App, world_model: WorldModel, agenda: Agenda, schema_registry: SchemaRegistry) {
    this.app = app;
    this.world_model = world_model;
    this.agenda = agenda;
    this.schema_registry = schema_registry;

    this.activeThoughtsList = document.getElementById('active-thoughts-list')!;
    this.completedThoughtsList = document.getElementById('completed-thoughts-list')!;
    this.schemaList = document.getElementById('schema-list')!;
    this.scopeDebugger = document.getElementById('scope-debugger-content')!;
    this.focusMetric = document.getElementById('focus-metric')!;
    this.memoryMetric = document.getElementById('memory-metric')!;
    this.energyMetric = document.getElementById('energy-metric')!;
    this.newThoughtInput = document.getElementById('new-thought-input') as HTMLInputElement;
    this.addNewThoughtButton = document.getElementById('add-new-thought-button')!;
    this.settingsBtn = document.getElementById('settings-btn')!;
    this.settingsModal = document.getElementById('settings-modal')!;
    this.closeModalBtn = this.settingsModal.querySelector('.close-btn')!;
    this.userModeSelect = document.getElementById('user-mode-select') as HTMLSelectElement;
    this.container = document.querySelector('.container')!;
  }

  public async init() {
    await this.render();
    this.addNewThoughtButton.addEventListener('click', async () => {
      const content = this.newThoughtInput.value.trim();
      if (content) {
        const type = content.endsWith('?') ? TaskType.GOAL : TaskType.BELIEF;
        await this.app.add_new_thought(content, type);
        this.newThoughtInput.value = '';
        await this.render();
      }
    });

    this.settingsBtn.addEventListener('click', () => {
      this.settingsModal.style.display = 'block';
    });

    this.closeModalBtn.addEventListener('click', () => {
      this.settingsModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
      if (event.target === this.settingsModal) {
        this.settingsModal.style.display = 'none';
      }
    });

    this.userModeSelect.addEventListener('change', async (event) => {
      this.currentMode = (event.target as HTMLSelectElement).value;
      this.container.dataset.mode = this.currentMode;
      await this.render();
    });
  }

  public async render() {
    const activeTasks = await this.get_active_thoughts();
    const completedTasks = this.get_completed_thoughts();

    this.activeThoughtsList.innerHTML = activeTasks.map(t => this.renderThoughtCard(t, false)).join('');
    this.completedThoughtsList.innerHTML = completedTasks.map(t => this.renderThoughtCard(t, true)).join('');

    this.attach_active_thought_listeners();
    this.attach_hold_listener();
    this.attach_knowledge_action_listeners();
    await this.renderMetrics();
    this.render_schemas();
    this.render_scope_debugger();
  }

  private render_scope_debugger() {
    const bindings = this.app.last_scope_bindings;
    if (bindings && Object.keys(bindings).length > 0) {
      this.scopeDebugger.innerHTML = `
        <div class="scope-card">
          <h4>Last Resolved Scope</h4>
          <ul>
            ${Object.entries(bindings).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join('')}
          </ul>
        </div>
      `;
    } else {
      this.scopeDebugger.innerHTML = `<p>No active scope resolution.</p>`;
    }
  }

  private render_schemas() {
    const schemas = this.schema_registry.get_all();
    this.schemaList.innerHTML = schemas.map(schema => `
      <div class="schema-card">
        <h4>${schema.constructor.name}</h4>
        <p><strong>Trigger:</strong> <code>${schema.get_trigger_pattern()}</code></p>
        <p><strong>Status:</strong> ACTIVE</p>
      </div>
    `).join('');
  }

  private attach_knowledge_action_listeners() {
    this.completedThoughtsList.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      const taskId = target.dataset.taskId;
      if (!taskId) return;

      if (target.classList.contains('star-btn')) {
        await this.app.star_belief(taskId);
      } else if (target.classList.contains('question-btn')) {
        await this.app.question_belief(taskId);
      } else if (target.classList.contains('forget-btn')) {
        await this.app.forget_belief(taskId);
      }
      await this.render();
    });
  }

  private attach_active_thought_listeners() {
    this.activeThoughtsList.addEventListener('click', async (event) => {
        const target = event.target as HTMLElement;
        const taskId = target.closest('.thought-card')?.dataset.taskId;
        if (!taskId) return;

        if (target.classList.contains('promote-btn')) {
            await this.app.boost_task(taskId);
            await this.render();
        } else if (target.classList.contains('demote-btn')) {
            await this.app.reduce_task_priority(taskId);
            await this.render();
        }
    });

    const cards = this.activeThoughtsList.querySelectorAll('.thought-card');
    cards.forEach(card => {
      const hammer = new Hammer(card as HTMLElement);
      const taskId = (card as HTMLElement).dataset.taskId;
      if (!taskId) return;

      hammer.on('swiperight', async () => {
        await this.app.boost_task(taskId);
        await this.render();
      });

      hammer.on('swipeleft', async () => {
        await this.app.reduce_task_priority(taskId);
        await this.render();
      });
    });
  }

  private attach_hold_listener() {
    const cards = this.activeThoughtsList.querySelectorAll('.thought-card');
    cards.forEach(card => {
        const hammer = new Hammer(card as HTMLElement);
        const taskId = (card as HTMLElement).dataset.taskId;
        if (!taskId) return;

        hammer.on('press', async () => {
            await this.app.pin_task(taskId);
            await this.render();
        });
    });
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

    if (is_procedure_task(task, this.world_model)) {
      const handler_name = extract_handler_name(atom.content);
      const query = extract_param(atom.content, "query");
      guiTask.next_step = `Procedure: ${handler_name}(${query || '...'})`;
    } else if (task.type === TaskType.GOAL) {
      guiTask.next_step = "Finding relevant beliefs and schemas...";
    } else if (task.type === TaskType.BELIEF) {
      guiTask.next_step = "Integrating into world model, finding resonant tasks...";
    }

    guiTask.path_history = this.build_path_history(task);

    return guiTask;
  }

  private build_path_history(task: Task, depth = 0): string {
    if (depth > 3 || task.stamp.parent_ids.length === 0) {
      const atom = this.world_model.get_atom(task.atom_id);
      return atom.content;
    }

    const parent_id = task.stamp.parent_ids[0];
    try {
      const parent_task = this.world_model.get_task(parent_id);
      const parent_path = this.build_path_history(parent_task, depth + 1);
      const current_atom = this.world_model.get_atom(task.atom_id);
      return `${parent_path} → ${current_atom.content}`;
    } catch (e) {
      console.error(`Could not trace back path history for task ${task.id}`, e);
      const atom = this.world_model.get_atom(task.atom_id);
      return atom.content;
    }
  }

  private async get_active_thoughts(): Promise<GuiTask[]> {
    const tasks = await this.agenda.get_all_tasks();
    return tasks.map(task => this.map_task_to_gui_task(task));
  }

  private get_completed_thoughts(): GuiTask[] {
    return Array.from(this.world_model.tasks.values())
      .filter(task => task.type === TaskType.BELIEF)
      .map(t => this.map_task_to_gui_task(t));
  }

  private async get_cognitive_metrics() {
    const activeTasks = await this.agenda.size();
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
    const isPinned = this.app.is_task_pinned(task.id);

    let details: string[] = [];

    if (isCompleted) {
        details = [
            `<p>• ${confidence}</p>`,
            `<p>• Source: ${task.source || 'N/A'} | Completed: ${task.completed_ago || 'N/A'}</p>`,
        ];
        if (this.currentMode !== 'thinking') {
            details.push(task.path_history ? `<p>• Path: ${task.path_history}</p>` : '');
        }
        details.push(
            `<p>• Verified by: ${task.verification_status || 'N/A'}</p>`,
            `<p>• Knowledge Retention: ${task.knowledge_retention || 'N/A'}</p>`
        );
    } else {
        details = [
            `<p>• Priority: <strong>${task.priority_text}</strong> | ${confidence}</p>`,
            task.next_step ? `<p>• Next step: ${task.next_step}</p>` : '',
        ];
        if (this.currentMode !== 'thinking') {
            details.push(task.related_to ? `<p>• Related to: ${task.related_to}</p>` : '');
            details.push(task.path_history ? `<p>• Path: ${task.path_history}</p>` : '');
        }
        details.push(`<p>• Created: ${task.created_ago || 'N/A'} | Retains for: ${task.retains_for || 'N/A'}</p>`);
    }

    if (this.currentMode === 'expert' || this.currentMode === 'debugger') {
        details.push(`<p>• Truth: f=${task.truth?.frequency.toFixed(2)}, c=${task.truth?.confidence.toFixed(2)}</p>`);
        details.push(`<p>• Attention: p=${task.attention.priority.toFixed(2)}, d=${task.attention.durability.toFixed(2)}</p>`);
    }
    if (this.currentMode === 'debugger') {
        details.push(`<p>• Task ID: ${task.id}</p>`);
        details.push(`<p>• Atom ID: ${task.atom_id}</p>`);
    }

    if (isCompleted) {
        details.push(`<div class="knowledge-actions">
            <button class="action-btn star-btn" data-task-id="${task.id}">⭐ Star</button>
            <button class="action-btn question-btn" data-task-id="${task.id}">❓ Question</button>
            <button class="action-btn forget-btn" data-task-id="${task.id}">🗑️ Forget</button>
          </div>`);
    }

    const hoverActions = !isCompleted ? `
      <div class="hover-actions">
        <button class="hover-btn promote-btn" data-task-id="${task.id}" title="Promote">▲</button>
        <button class="hover-btn demote-btn" data-task-id="${task.id}" title="Demote">▼</button>
      </div>
    ` : '';

    return `
      <div class="thought-card ${priorityClass}" data-task-id="${task.id}">
        ${hoverActions}
        <h4>${icon} ${isPinned ? '📌' : ''}[${task.priority_text}] ${task.content}</h4>
        ${details.filter(Boolean).join('')}
      </div>
    `;
  }

  private async renderMetrics() {
    const metrics = await this.get_cognitive_metrics();
    this.focusMetric.textContent = `${metrics.focus} (${metrics.active_thoughts} tasks)`;
    this.memoryMetric.textContent = metrics.memory;
    this.energyMetric.textContent = metrics.energy;
  }
}
