import { Gui } from './index';
import { GuiTask } from './types';
import { is_procedure_task, extract_handler_name, extract_param } from '../core/procedure';
import { parseScopeExpression, substituteInContent } from '../core/scope';

export class Renderer {
    private gui: Gui;

    constructor(gui: Gui) {
        this.gui = gui;
    }

    public async render() {
        const activeTasks = await this.get_active_thoughts();
        const completedTasks = this.get_completed_thoughts();

        this.gui.activeThoughtsList.innerHTML = activeTasks.map(t => this.renderThoughtCard(t, false)).join('');
        this.gui.completedThoughtsList.innerHTML = completedTasks.map(t => this.renderThoughtCard(t, true)).join('');

        // These will be moved to the event listener class
        // this.attach_active_thought_listeners();
        // this.attach_hold_listener();
        // this.attach_knowledge_action_listeners();
        await this.renderMetrics();
        this.render_schemas();
        this.render_scope_debugger();
    }

    private render_scope_debugger() {
        const bindings = this.gui.app.last_scope_bindings;
        const task = this.gui.app.last_scope_task;

        if (bindings && task) {
            try {
                const atom = this.gui.world_model.get_atom(task.atom_id);
                const parsedScope = parseScopeExpression(atom.content);

                const requiredVars = new Set(parsedScope.variables.filter(v => v.required).map(v => v.name));
                const boundVars = new Set(Object.keys(bindings));
                const isFullyResolved = [...requiredVars].every(v => boundVars.has(v));

                const template = parsedScope.bodies.join(', ');
                const templateName = parsedScope.bodies.length > 0 ? parsedScope.bodies[0] : 'Unnamed Template';
                const result = substituteInContent(template, bindings);

                this.gui.scopeDebugger.innerHTML = `
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
                this.gui.scopeDebugger.innerHTML = `<p>Error rendering scope.</p>`;
            }
        } else {
            this.gui.scopeDebugger.innerHTML = `<p>No active scope resolution.</p>`;
        }
    }

    private render_schemas() {
        const schemas = this.gui.schema_registry.get_all();
        this.gui.schemaList.innerHTML = schemas.map(schema => `
      <div class="schema-card">
        <h4>${schema.constructor.name}</h4>
        <p><strong>Trigger:</strong> <code>${JSON.stringify(schema.get_trigger_pattern())}</code></p>
        <p><strong>Status:</strong> ACTIVE</p>
      </div>
    `).join('');
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

    private map_task_to_gui_task(task: any): GuiTask {
        const atom = this.gui.world_model.get_atom(task.atom_id);
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
                ? `Related to: ${task.stamp.parent_ids.map((id: any) => {
                    try {
                        return this.gui.world_model.get_atom(this.gui.world_model.get_task(id).atom_id).content;
                    } catch (e) {
                        console.error(`Error fetching related task atom content for ID ${id}:`, e);
                        return 'Unknown';
                    }
                }).join(', ')}`
                : undefined,
            path_history: path_history,
            source: task.stamp.schema_id
                ? (this.gui.schema_registry.get(task.stamp.schema_id)?.constructor.name || `Schema ID: ${task.stamp.schema_id}`)
                : 'N/A',
            completed_ago: task.type === 'BELIEF' ? this.get_time_ago(task.stamp.timestamp) : undefined,
            verification_status: task.verified ? 'Verified by user' : 'Unverified',
            knowledge_retention: task.type === 'BELIEF' ? this.get_retention_time(task.attention.durability) : undefined,
        };

        if (is_procedure_task(task, this.gui.world_model)) {
            const handler_name = extract_handler_name(atom.content);
            const query = extract_param(atom.content, "query");
            guiTask.next_step = `Running Procedure: ${handler_name}(${query || '...'})`;
        } else if (task.type === 'GOAL') {
            guiTask.next_step = "Actively seeking context and applicable schemas.";
        } else if (task.type === 'BELIEF') {
            guiTask.next_step = "Being considered for integration into knowledge base.";
        }

        return guiTask;
    }

    private async get_active_thoughts(): Promise<GuiTask[]> {
        const tasks = await this.gui.agenda.get_all_tasks();
        return tasks.map(task => this.map_task_to_gui_task(task));
    }

    private get_completed_thoughts(): GuiTask[] {
        return Object.values(this.gui.world_model.tasks)
            .filter(task => task.type === 'BELIEF')
            .map(t => this.map_task_to_gui_task(t));
    }

    private async get_cognitive_metrics() {
        const activeTasks = await this.get_active_thoughts();
        const activeTaskCount = activeTasks.length;
        const completedBeliefs = Array.from(this.gui.world_model.tasks.values()).filter(task => task.type === 'BELIEF').length;
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

        const energyTrend = energyLevel > this.gui.lastEnergyLevel ? '↗' : energyLevel < this.gui.lastEnergyLevel ? '↘' : '→';
        this.gui.lastEnergyLevel = energyLevel;

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
        if (is_procedure_task(task, this.gui.world_model)) return '🔍';
        switch (task.type) {
            case 'GOAL': return '🎯';
            case 'QUESTION': return '❓';
            case 'BELIEF': return '💡';
            case 'PROCEDURE': return '⚙️';
            case 'QUEST': return '🗺️';
            default: return '💭';
        }
    }

    private renderThoughtCard(task: GuiTask, isCompleted: boolean): string {
        const priorityClass = isCompleted ? 'completed' : this.getPriorityClass(task.attention.priority);
        const icon = this.getTaskIcon(task, isCompleted);
        const confidence = `Confidence: ${((task.truth?.confidence ?? 0) * 100).toFixed(0)}%`;
        const isPinned = this.gui.app.is_task_pinned(task.id);

        let details: string[] = [];

        if (is_procedure_task(task, this.gui.world_model) && !isCompleted) {
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
            if (this.gui.currentMode !== 'thinking') {
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
            if (this.gui.currentMode !== 'thinking') {
                details.push(task.related_to ? `<p>• Related to: ${task.related_to}</p>` : '');
                details.push(task.path_history ? `<p>• Path: ${task.path_history}</p>` : '');
            }
            details.push(`<p>• Created: ${task.created_ago || 'N/A'} | Retains for: ${task.retains_for || 'N/A'}</p>`);
        }

        if (this.gui.currentMode === 'expert' || this.gui.currentMode === 'debugger') {
            details.push(`<p>• Truth: f=${task.truth?.frequency.toFixed(2)}, c=${task.truth?.confidence.toFixed(2)}</p>`);
            details.push(`<p>• Attention: p=${task.attention.priority.toFixed(2)}, d=${task.attention.durability.toFixed(2)}</p>`);
        }
        if (this.gui.currentMode === 'debugger') {
            details.push(`<p>• Task ID: ${task.id}</p>`);
            details.push(`<p>• Atom ID: ${task.atom_id}</p>`);
        }

        const feedbackActions = `
      <div class="feedback-actions">
        <button class="action-btn feedback-btn thumb-up-btn" data-task-id="${task.id}" title="This is correct/important">👍</button>
        <button class="action-btn feedback-btn thumb-down-btn" data-task-id="${task.id}" title="This is incorrect/unimportant">👎</button>
      </div>
    `;

        if (isCompleted) {
            details.push(`<div class="knowledge-actions">
            ${feedbackActions}
            <button class="action-btn star-btn" data-task-id="${task.id}">⭐ Star</button>
            <button class="action-btn question-btn" data-task-id="${task.id}">❓ Question</button>
            <button class="action-btn forget-btn" data-task-id="${task.id}">🗑️ Forget</button>
          </div>`);
        }

        return `
      <div class="thought-card ${priorityClass}" data-task-id="${task.id}">
        <div class="card-header">
            <h4>${icon} ${isPinned ? '📌' : ''}[${task.priority_text}] ${task.content}</h4>
            ${!isCompleted ? feedbackActions : ''}
        </div>
        ${details.filter(Boolean).join('')}
      </div>
    `;
    }

    private async renderMetrics() {
        const metrics = await this.get_cognitive_metrics();
        const totalActive = metrics.active_thoughts;

        this.gui.focusMetric.textContent = metrics.focus;
        this.gui.activeThoughtsMetric.textContent = String(metrics.active_thoughts);
        this.gui.memoryMetric.textContent = metrics.memory;
        this.gui.energyTrendMetric.textContent = metrics.energy_trend;

        const dist = metrics.priority_distribution;
        this.gui.highPriorityBar.style.width = totalActive > 0 ? `${(dist.high / totalActive) * 100}%` : '0%';
        this.gui.medPriorityBar.style.width = totalActive > 0 ? `${(dist.medium / totalActive) * 100}%` : '0%';
        this.gui.lowPriorityBar.style.width = totalActive > 0 ? `${(dist.low / totalActive) * 100}%` : '0%';

        this.gui.highPriorityValue.textContent = `${dist.high} items`;
        this.gui.medPriorityValue.textContent = `${dist.medium} items`;
        this.gui.lowPriorityValue.textContent = `${dist.low} items`;
    }

    public render_suggestion(question: string) {
        const container = document.getElementById('suggestion-container');
        if (!container) return;

        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'suggestion-card';
        suggestionElement.innerHTML = `
            <p>${question}</p>
            <div class="suggestion-actions">
                <button class="btn-yes">Yes</button>
                <button class="btn-no">No</button>
            </div>
        `;

        container.appendChild(suggestionElement);

        suggestionElement.querySelector('.btn-yes')?.addEventListener('click', () => {
            this.gui.app.add_new_thought(question, 'GOAL');
            container.innerHTML = '';
        });

        suggestionElement.querySelector('.btn-no')?.addEventListener('click', () => {
            container.innerHTML = '';
        });
    }
}
