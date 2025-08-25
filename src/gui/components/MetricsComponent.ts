import { Gui } from '../index';
import { TaskType } from '../../core/types';

export class MetricsComponent {
    private gui: Gui;

    // DOM Elements
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
    private activeWorkersMetric: HTMLElement;
    private tasksPerSecMetric: HTMLElement;

    constructor(gui: Gui) {
        this.gui = gui;

        // Cache DOM element references
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
        this.activeWorkersMetric = document.getElementById('active-workers-metric')!;
        this.tasksPerSecMetric = document.getElementById('tasks-per-sec-metric')!;

        this.subscribe_to_events();
        // Initial render to populate metrics on load
        this.render();
    }

    private subscribe_to_events() {
        // A wide range of events can affect metrics, so we listen to them all
        const events = [
            'task_added_to_agenda',
            'task_removed_from_agenda',
            'task_updated_in_agenda',
            'belief_added_to_world_model',
            'belief_updated_in_world_model',
            'belief_removed_from_world_model',
        ];

        events.forEach(event => {
            this.gui.event_bus.on(event, () => this.render());
        });

        // Also, it's good to have a periodic update for time-based metrics like energy trend
        // The main simulation loop in Gui class handles calling render, so this is sufficient.
    }

    public async render() {
        const metrics = await this.get_cognitive_metrics();
        const totalActive = metrics.active_thoughts;

        this.focusMetric.textContent = metrics.focus;
        this.activeThoughtsMetric.textContent = String(metrics.active_thoughts);
        this.memoryMetric.textContent = String(metrics.memory_items);
        this.energyTrendMetric.textContent = metrics.energy_trend;

        // Worker Pool Metrics
        const busyWorkers = this.gui.workerPool.getSize() - this.gui.workerPool.getFreeWorkerCount();
        this.activeWorkersMetric.textContent = `${busyWorkers} / ${this.gui.workerPool.getSize()}`;
        this.tasksPerSecMetric.textContent = this.gui.workerPool.getTasksPerSecond().toFixed(2);

        const dist = metrics.priority_distribution;
        const totalDist = dist.high + dist.medium + dist.low;

        this.highPriorityBar.style.width = totalDist > 0 ? `${(dist.high / totalDist) * 100}%` : '0%';
        this.medPriorityBar.style.width = totalDist > 0 ? `${(dist.medium / totalDist) * 100}%` : '0%';
        this.lowPriorityBar.style.width = totalDist > 0 ? `${(dist.low / totalDist) * 100}%` : '0%';

        this.highPriorityValue.textContent = `${dist.high}`;
        this.medPriorityValue.textContent = `${dist.medium}`;
        this.lowPriorityValue.textContent = `${dist.low}`;
    }

    private async get_cognitive_metrics() {
        const activeTasks = await this.gui.agenda.get_all_tasks();
        const memoryTasks = Object.values(this.gui.world_model.tasks).filter(task => task.type === TaskType.BELIEF);

        const activeTaskCount = activeTasks.length;
        const memoryItemCount = memoryTasks.length;

        const totalPriority = activeTasks.reduce((sum, task) => sum + task.attention.priority, 0);
        const focusLevel = activeTaskCount > 0 ? (totalPriority / activeTaskCount) * 100 : 0;

        const priorityDistribution = { high: 0, medium: 0, low: 0 };
        activeTasks.forEach(task => {
            if (task.attention.priority > 0.75) priorityDistribution.high++;
            else if (task.attention.priority > 0.5) priorityDistribution.medium++;
            else priorityDistribution.low++;
        });

        const energyTrend = focusLevel > this.gui.lastEnergyLevel ? '↗' : focusLevel < this.gui.lastEnergyLevel ? '↘' : '→';
        this.gui.lastEnergyLevel = focusLevel;

        return {
            focus: `${focusLevel.toFixed(0)}%`,
            active_thoughts: activeTaskCount,
            memory_items: memoryItemCount,
            energy_trend: energyTrend,
            priority_distribution: priorityDistribution,
        };
    }
}
