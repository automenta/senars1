import { Gui } from '../index';

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

    constructor(gui: Gui) {
        this.gui = gui;

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

        this.subscribe_to_events();
    }

    private subscribe_to_events() {
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
    }

    public async render() {
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

    private async get_cognitive_metrics() {
        const activeTasks = await this.gui.agenda.get_all_tasks();
        const activeTaskCount = activeTasks.length;
        const completedBeliefs = Object.values(this.gui.world_model.tasks).filter(task => task.type === 'BELIEF').length;
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
}
