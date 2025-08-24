import Hammer from 'hammerjs';
import { App } from './app';
import { Task } from './core/models';
import { TaskType } from './core/types';
import { WorldModel } from './core/world-model';
import { Agenda } from './core/agenda';
import { SchemaRegistry } from './core/schema-registry';
import { is_procedure_task, extract_handler_name, extract_param } from './core/procedure';
import { parseScopeExpression, substituteInContent } from './core/scope';

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

  // DOM Elements
  private activeThoughtsList: HTMLElement;
  private completedThoughtsList: HTMLElement;
  private schemaList: HTMLElement;
  private scopeDebugger: HTMLElement;
  private focusMetric: HTMLElement;
  private activeThoughtsMetric: HTMLElement;
  private memoryMetric: HTMLElement;
  private energyTrendMetric: HTMLElement;
  private highPriorityBar: HTMLElement;
  private medPriorityBar: HTMLElement;
  private lowPriorityBar: HTMLElement;
  private highPriorityValue: HTMLElement;
  private medPriorityValue: HTMLElement;
  private lowPriorityValue: HTMLElement;
  private newThoughtInput: HTMLInputElement;
  private addNewThoughtButton: HTMLElement;
  private settingsBtn: HTMLElement;
  private settingsModal: HTMLElement;
  private closeModalBtn: HTMLElement;
  private userModeSelect: HTMLSelectElement;
  private container: HTMLElement;
  private llmApiKeyInput: HTMLInputElement;
  private llmModelNameInput: HTMLInputElement;
  private saveLlmConfigBtn: HTMLElement;
  private llmConfigStatus: HTMLElement;

  private currentMode: string = 'thinking';
  private lastEnergyLevel: number = 0;

  constructor(app: App, world_model: WorldModel, agenda: Agenda, schema_registry: SchemaRegistry) {
    this.app = app;
    this.world_model = world_model;
    this.agenda = agenda;
    this.schema_registry = schema_registry;

    // Cache all DOM element selections
    this.activeThoughtsList = document.getElementById('active-thoughts-list')!;
    this.completedThoughtsList = document.getElementById('completed-thoughts-list')!;
    this.schemaList = document.getElementById('schema-list')!;
    this.scopeDebugger = document.getElementById('scope-debugger-content')!;
    this.focusMetric = document.getElementById('focus-metric')!;
    this.activeThoughtsMetric = document.getElementById('active-thoughts-metric')!;
    this.memoryMetric = document.getElementById('memory-metric')!;
    this.energyTrendMetric = document.getElementById('energy-trend-metric')!;
    this.highPriorityBar = document.getElementById('high-priority-bar')!;
    this.medPriorityBar = document.getElementById('med-priority-bar')!;
    this.lowPriorityBar = document.getElementById('low-priority-bar')!;
    this.highPriorityValue = document.getElementById('high-priority-value')!;
    this.medPriorityValue = document.getElementById('med-priority-value')!;
    this.lowPriorityValue = document.getElementById('low-priority-value')!;
    this.newThoughtInput = document.getElementById('new-thought-input') as HTMLInputElement;
    this.addNewThoughtButton = document.getElementById('add-new-thought-button')!;
    this.settingsBtn = document.getElementById('settings-btn')!;
    this.settingsModal = document.getElementById('settings-modal')!;
    this.closeModalBtn = this.settingsModal.querySelector('.close-btn')!;
    this.userModeSelect = document.getElementById('user-mode-select') as HTMLSelectElement;
    this.container = document.querySelector('.container')!;
    this.llmApiKeyInput = document.getElementById('llm-api-key') as HTMLInputElement;
    this.llmModelNameInput = document.getElementById('llm-model-name') as HTMLInputElement;
    this.saveLlmConfigBtn = document.getElementById('save-llm-config-btn')!;
    this.llmConfigStatus = document.getElementById('llm-config-status')!;
  }

  public async init() {
    this.load_llm_config();
    this.attach_event_listeners();
    await this.render();
  }

  private attach_event_listeners() {
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

    this.saveLlmConfigBtn.addEventListener('click', () => {
        this.save_llm_config();
    });

    window.addEventListener('keydown', async (event) => {
      const activeCard = document.querySelector('.thought-card.active-card') as HTMLElement;
      if (!activeCard) return;

      const taskId = activeCard.dataset.taskId;
      if (!taskId) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        await this.app.boost_task(taskId);
        await this.render();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        await this.app.reduce_task_priority(taskId);
        await this.render();
      }
    });
  }

  private load_llm_config() {
      const configStr = localStorage.getItem('llmConfig');
      if (configStr) {
          const config = JSON.parse(configStr);
          this.llmApiKeyInput.value = config.apiKey || '';
          this.llmModelNameInput.value = config.modelName || '';
          this.app.update_llm_config(config);
          this.llmConfigStatus.textContent = 'Loaded saved configuration.';
      }
  }

  private save_llm_config() {
      const config = {
          apiKey: this.llmApiKeyInput.value,
          modelName: this.llmModelNameInput.value
      };
      if (!config.apiKey || !config.modelName) {
          this.llmConfigStatus.textContent = 'API Key and Model Name are required.';
          this.llmConfigStatus.style.color = 'red';
          return;
      }
      localStorage.setItem('llmConfig', JSON.stringify(config));
      this.app.update_llm_config(config);
      this.llmConfigStatus.textContent = 'Configuration saved!';
      this.llmConfigStatus.style.color = 'green';
      setTimeout(() => {
        this.llmConfigStatus.textContent = '';
      }, 3000);
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
    const task = this.app.last_scope_task;

    if (bindings && task) {
      try {
        const atom = this.world_model.get_atom(task.atom_id);
        const parsedScope = parseScopeExpression(atom.content);

        const requiredVars = new Set(parsedScope.variables.filter(v => v.required).map(v => v.name));
        const boundVars = new Set(Object.keys(bindings));
        const isFullyResolved = [...requiredVars].every(v => boundVars.has(v));

        const template = parsedScope.bodies.join(', ');
        // Use the first body as a representative name for the template.
        const templateName = parsedScope.bodies.length > 0 ? parsedScope.bodies[0] : 'Unnamed Template';
        const result = substituteInContent(template, bindings);

        this.scopeDebugger.innerHTML = `
          <div class="scope-card">
            <h4>🌐 THOUGHT TEMPLATE: ${templateName}</h4>
            <p><strong>Template:</strong> ${template}</p>
            <p><strong>Bindings:</strong></p>
            <ul>
              ${Object.entries(bindings).map(([key, value]) => `<li>• ${key} = ${value}</li>`).join('')}
            </ul>
            <p><strong>Status:</strong> ${isFullyResolved ? '✅ Fully resolved' : '⚠️ Partially resolved'}</p>
            <p><strong>Result:</strong> ${result}</p>
          </div>
        `;
      } catch (e) {
        console.error("Error rendering scope debugger:", e);
        this.scopeDebugger.innerHTML = `<p>Error rendering scope.</p>`;
      }
    } else {
      this.scopeDebugger.innerHTML = `<p>No active scope resolution.</p>`;
    }
  }

  private render_schemas() {
    const schemas = this.schema_registry.get_all();
    this.schemaList.innerHTML = schemas.map(schema => `
      <div class="schema-card">
        <h4>${schema.constructor.name}</h4>
        <p><strong>Trigger:</strong> <code>${JSON.stringify(schema.get_trigger_pattern())}</code></p>
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
      } else if (target.classList.contains('verify-btn')) {
        await this.app.verify_belief(taskId);
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

      card.addEventListener('mouseenter', () => {
        document.querySelectorAll('.thought-card.active-card').forEach(c => c.classList.remove('active-card'));
        card.classList.add('active-card');
      });

      card.addEventListener('mouseleave', () => {
        card.classList.remove('active-card');
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
    const path_history = (task.stamp.path && task.stamp.path.length > 0)
      ? [...task.stamp.path, atom.content].join(' → ')
      : atom.content;

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
      path_history: path_history,
      source: task.stamp.schema_id
        ? (this.schema_registry.get(task.stamp.schema_id)?.constructor.name || `Schema ID: ${task.stamp.schema_id}`)
        : 'N/A',
      completed_ago: task.type === TaskType.BELIEF ? this.get_time_ago(task.stamp.timestamp) : undefined,
      verification_status: task.verified ? 'Verified by user' : 'Unverified',
      knowledge_retention: task.type === TaskType.BELIEF ? this.get_retention_time(task.attention.durability) : undefined,
    };

    if (is_procedure_task(task, this.world_model)) {
      const handler_name = extract_handler_name(atom.content);
      const query = extract_param(atom.content, "query");
      guiTask.next_step = `Running Procedure: ${handler_name}(${query || '...'})`;
    } else if (task.type === TaskType.GOAL) {
      guiTask.next_step = "Actively seeking context and applicable schemas.";
    } else if (task.type === TaskType.BELIEF) {
      guiTask.next_step = "Being considered for integration into knowledge base.";
    }

    return guiTask;
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
    const activeTasks = await this.agenda.get_all_tasks();
    const activeTaskCount = activeTasks.length;
    const completedBeliefs = Array.from(this.world_model.tasks.values()).filter(task => task.type === TaskType.BELIEF).length;
    const totalTasks = activeTaskCount + completedBeliefs;
    const focusLevel = totalTasks > 0 ? ((activeTaskCount / totalTasks) * 100).toFixed(0) : '0';
    const memoryItems = completedBeliefs;

    let energyLevel = 0;
    const priorityDistribution = { high: 0, medium: 0, low: 0 };

    if (activeTaskCount > 0) {
      const totalPriority = activeTasks.reduce((sum, task) => {
        if (task.attention.priority > 0.75) priorityDistribution.high++;
        else if (task.attention.priority > 0.5) priorityDistribution.medium++;
        else priorityDistribution.low++;
        return sum + task.attention.priority;
      }, 0);
      energyLevel = (totalPriority / activeTaskCount) * 100;
    }

    const energyTrend = energyLevel > this.lastEnergyLevel ? '↗' : energyLevel < this.lastEnergyLevel ? '↘' : '→';
    this.lastEnergyLevel = energyLevel;

    return {
      focus: `${focusLevel}%`,
      active_thoughts: activeTaskCount,
      memory: `${memoryItems}`,
      energy_trend: energyTrend,
      priority_distribution: priorityDistribution,
    };
  }

  private getPriorityClass(priority: number): string {
    if (priority > 0.75) return 'priority-high';
    if (priority > 0.5) return 'priority-medium';
    return 'priority-low';
  }

  private getTaskIcon(task: GuiTask, isCompleted: boolean): string {
    if (isCompleted) return '✅';
    if (is_procedure_task(task, this.world_model)) return '🔍';
    switch (task.type) {
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
    const icon = this.getTaskIcon(task, isCompleted);
    const confidence = `Confidence: ${((task.truth?.confidence ?? 0) * 100).toFixed(0)}%`;
    const isPinned = this.app.is_task_pinned(task.id);

    let details: string[] = [];

    if (is_procedure_task(task, this.world_model) && !isCompleted) {
        const handler_name = extract_handler_name(task.content);
        const query = extract_param(task.content, "query");
        details = [
            `<p>• Status: 🟡 In progress</p>`,
            `<p>• Method: ${handler_name} query</p>`,
            `<p>• Input: "${query}"</p>`,
            `<p>• Safety: Sandboxed | Verified source</p>`
        ];
    } else if (isCompleted) {
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
        const verifyButton = !task.verified
            ? `<button class="action-btn verify-btn" data-task-id="${task.id}">✔️ Verify</button>`
            : '';
        details.push(`<div class="knowledge-actions">
            <button class="action-btn star-btn" data-task-id="${task.id}">⭐ Star</button>
            <button class="action-btn question-btn" data-task-id="${task.id}">❓ Question</button>
            ${verifyButton}
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
    const totalActive = metrics.active_thoughts;

    this.focusMetric.textContent = metrics.focus;
    this.activeThoughtsMetric.textContent = String(metrics.active_thoughts);
    this.memoryMetric.textContent = metrics.memory;
    this.energyTrendMetric.textContent = metrics.energy_trend;

    const dist = metrics.priority_distribution;
    this.highPriorityBar.style.width = totalActive > 0 ? `${(dist.high / totalActive) * 100}%` : '0%';
    this.medPriorityBar.style.width = totalActive > 0 ? `${(dist.medium / totalActive) * 100}%` : '0%';
    this.lowPriorityBar.style.width = totalActive > 0 ? `${(dist.low / totalActive) * 100}%` : '0%';

    this.highPriorityValue.textContent = `${dist.high} items`;
    this.medPriorityValue.textContent = `${dist.medium} items`;
    this.lowPriorityValue.textContent = `${dist.low} items`;
  }
}
