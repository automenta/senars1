import { Gui } from '../index';
import { ThoughtListComponent } from './ThoughtListComponent';
import { Task } from '../../core/models';

export class CompletedThoughtsComponent extends ThoughtListComponent {
    constructor(gui: Gui) {
        super(gui, 'completed-thoughts-list');
    }

    protected subscribe_to_events(): void {
        this.gui.event_bus.on('belief_added_to_world_model', (task: Task) => {
            const guiTask = this.gui.renderer.map_task_to_gui_task(task);
            this.add_thought_card(guiTask, true);
        });

        this.gui.event_bus.on('belief_updated_in_world_model', (task: Task) => {
            const guiTask = this.gui.renderer.map_task_to_gui_task(task);
            this.update_thought_card(guiTask, true);
        });

        this.gui.event_bus.on('belief_removed_from_world_model', (taskId: string) => {
            this.remove_thought_card(taskId);
        });
    }

    public render() {
        const tasks = Object.values(this.gui.world_model.tasks)
            .filter(task => task.type === 'BELIEF');
        const guiTasks = tasks.map(task => this.gui.renderer.map_task_to_gui_task(task));
        this.container.innerHTML = guiTasks.map(t => this.gui.renderer.renderThoughtCard(t, true)).join('');
    }
}
