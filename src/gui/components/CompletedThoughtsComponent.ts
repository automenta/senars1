import { Gui } from '../index';
import { ThoughtListComponent } from './ThoughtListComponent';
import { Task } from '../../core/models';
import { TaskType } from '../../core/types';

export class CompletedThoughtsComponent extends ThoughtListComponent {
    constructor(gui: Gui) {
        super(gui, 'completed-thoughts-list');
        // Initial render
        this.render();
    }

    protected subscribe_to_events(): void {
        // When the world model changes, re-render the entire list.
        this.gui.event_bus.on('belief_added_to_world_model', () => this.render());
        this.gui.event_bus.on('belief_updated_in_world_model', () => this.render());
        this.gui.event_bus.on('belief_removed_from_world_model', () => this.render());

        // Also re-render when the mode changes.
        this.gui.event_bus.on('mode_changed', () => this.render());
    }

    public render() {
        const tasks = Object.values(this.gui.world_model.tasks)
            .filter(task => task.type === TaskType.BELIEF);

        // Sort tasks by timestamp (most recent first)
        tasks.sort((a, b) => b.stamp.timestamp - a.stamp.timestamp);

        const guiTasks = tasks.map(task => this.gui.renderer.map_task_to_gui_task(task));

        // Clear the container and render all thoughts.
        this.container.innerHTML = '';
        guiTasks.forEach(t => {
            const cardHTML = this.gui.renderer.renderThoughtCard(t, true);
            this.container.insertAdjacentHTML('beforeend', cardHTML);
        });

        // Notify that a render has completed.
        this.gui.event_bus.emit('render_complete', {});
    }
}
