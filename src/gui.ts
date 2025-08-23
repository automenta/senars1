import { App, GuiTask } from './app';
import { TaskType } from './core/types';

const activeThoughtsList = document.getElementById('active-thoughts-list')!;
const completedThoughtsList = document.getElementById('completed-thoughts-list')!;
const focusMetric = document.getElementById('focus-metric')!;
const memoryMetric = document.getElementById('memory-metric')!;
const energyMetric = document.getElementById('energy-metric')!;
const newThoughtInput = document.getElementById('new-thought-input') as HTMLInputElement;
const addNewThoughtButton = document.getElementById('add-new-thought-button')!;

let app: App;

function getPriorityClass(priority: number): string {
  if (priority > 0.75) return 'priority-high';
  if (priority > 0.5) return 'priority-medium';
  return 'priority-low';
}

function getTaskIcon(taskType: TaskType, isCompleted: boolean): string {
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

function renderThoughtCard(task: GuiTask, isCompleted: boolean): string {
  const priorityClass = isCompleted ? 'completed' : getPriorityClass(task.attention.priority);
  const icon = getTaskIcon(task.type, isCompleted);

  let details = '';

  if (!isCompleted) {
    details += `<p>• Priority: <strong>${task.priority_text}</strong> | Confidence: ${((task.truth?.confidence ?? 0) * 100).toFixed(0)}%</p>`;
    if (task.related_to) {
      details += `<p>• Related to: ${task.related_to}</p>`;
    }
    if (task.next_step) {
      details += `<p>• Next step: ${task.next_step}</p>`;
    }
    details += `<p>• Created: ${task.created_ago || 'N/A'} | Retains for: ${task.retains_for || 'N/A'}</p>`;
    if (task.path_history) {
      details += `<p>• Path: ${task.path_history}</p>`;
    }
  } else {
    details += `<p>• Confidence: ${((task.truth?.confidence ?? 0) * 100).toFixed(0)}%</p>`;
    details += `<p>• Source: ${task.source || 'N/A'} | Completed: ${task.completed_ago || 'N/A'}</p>`;
    if (task.path_history) {
      details += `<p>• Path: ${task.path_history}</p>`;
    }
    details += `<p>• Verified by: ${task.verification_status || 'N/A'}</p>`;
    details += `<p>• Knowledge Retention: ${task.knowledge_retention || 'N/A'}</p>`;
  }

  return `
    <div class="thought-card ${priorityClass}">
      <h4>${icon} [${task.priority_text}] ${task.content}</h4>
      ${details}
    </div>
  `;
}

function renderMetrics() {
  const metrics = app.get_cognitive_metrics();
  focusMetric.textContent = `${metrics.focus} (${metrics.active_thoughts} tasks)`;
  memoryMetric.textContent = metrics.memory;
  energyMetric.textContent = metrics.energy;
}

export function render() {
  const activeTasks = app.get_active_thoughts();
  const completedTasks = app.get_completed_thoughts();

  activeThoughtsList.innerHTML = activeTasks.map(t => renderThoughtCard(t, false)).join('');
  completedThoughtsList.innerHTML = completedTasks.map(t => renderThoughtCard(t, true)).join('');

  renderMetrics();
}

export function initGUI(appInstance: App) {
  app = appInstance;
  render();

  addNewThoughtButton.addEventListener('click', () => {
    const content = newThoughtInput.value.trim();
    if (content) {
      // Simple heuristic for task type: if it ends with '?', it's a QUESTION/GOAL, otherwise BELIEF
      const type = content.endsWith('?') ? TaskType.GOAL : TaskType.BELIEF;
      app.add_new_thought(content, type);
      newThoughtInput.value = '';
      render(); // Re-render the UI after adding a new thought
    }
  });
}
