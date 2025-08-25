import { Gui } from '../index';
import { ThoughtListComponent } from './ThoughtListComponent';
import { Task } from '../../core/models';

export class ActiveThoughtsComponent extends ThoughtListComponent {
    constructor(gui: Gui) {
        super(gui, 'active-thoughts-list');
    }

    protected subscribe_to_events(): void {
        this.gui.event_bus.on('task_added_to_agenda', (task: Task) => {
            const guiTask = this.gui.renderer.map_task_to_gui_task(task);
            this.add_thought_card(guiTask, false);
        });

        this.gui.event_bus.on('task_removed_from_agenda', (taskId: string) => {
            this.remove_thought_card(taskId);
        });

        this.gui.event_bus.on('task_updated_in_agenda', (task: Task) => {
            const guiTask = this.gui.renderer.map_task_to_gui_task(task);
            this.update_thought_card(guiTask, false);
        });
    }

    public async render() {
        const tasks = await this.gui.agenda.get_all_tasks();
        const guiTasks = tasks.map(task => this.gui.renderer.map_task_to_gui_task(task));
        this.container.innerHTML = guiTasks.map(t => this.gui.renderer.renderThoughtCard(t, false)).join('');
    }
}
