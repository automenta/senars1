import { Gui } from '../index';
import { ThoughtListComponent } from './ThoughtListComponent';
import { Task } from '../../core/models';

export class ActiveThoughtsComponent extends ThoughtListComponent {
    constructor(gui: Gui) {
        super(gui, 'active-thoughts-list');
        // Initial render
        this.render();
    }

    protected subscribe_to_events(): void {
        // When the agenda changes, re-render the entire list.
        // This is simpler and more robust than manually adding/removing/updating cards.
        this.gui.event_bus.on('task_added_to_agenda', () => this.render());
        this.gui.event_bus.on('task_removed_from_agenda', () => this.render());
        this.gui.event_bus.on('task_updated_in_agenda', () => this.render());

        // Also re-render when the mode changes, as this affects the display.
        this.gui.event_bus.on('mode_changed', () => this.render());
    }

    public async render() {
        const tasks = await this.gui.agenda.get_all_tasks();

        // Sort tasks by priority (descending)
        tasks.sort((a, b) => b.attention.priority - a.attention.priority);

        const guiTasks = tasks.map(task => this.gui.renderer.map_task_to_gui_task(task));

        // Clear the container and render all thoughts.
        this.container.innerHTML = '';
        guiTasks.forEach(t => {
            const cardHTML = this.gui.renderer.renderThoughtCard(t, false);
            this.container.insertAdjacentHTML('beforeend', cardHTML);
        });

        // Notify that a render has completed, so gesture listeners can be attached.
        this.gui.event_bus.emit('render_complete', {});
    }
}
