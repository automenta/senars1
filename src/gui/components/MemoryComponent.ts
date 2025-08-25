import { Gui } from '../index';
import { ThoughtListComponent } from './ThoughtListComponent';
import { Task } from '../../core/models';
import { TaskType } from '../../core/types';

export class MemoryComponent extends ThoughtListComponent {
    constructor(gui: Gui) {
        super(gui, 'memory-list');
    }

    protected subscribe_to_events(): void {
        this.gui.event_bus.on('belief_added_to_world_model', (task: Task) => this.handle_belief_change(task));
        this.gui.event_bus.on('belief_updated_in_world_model', (task: Task) => this.handle_belief_change(task));
        this.gui.event_bus.on('belief_removed_from_world_model', (taskId: string) => this.remove_thought_card(taskId));
    }

    private handle_belief_change(task: Task) {
        if (this.is_memory(task)) {
            const guiTask = this.gui.renderer.map_task_to_gui_task(task);
            this.add_or_update_card(guiTask);
        } else {
            this.remove_thought_card(task.id);
        }
    }

    private add_or_update_card(guiTask) {
        const existing = document.getElementById(guiTask.id);
        if (existing) {
            this.update_thought_card(guiTask, true);
        } else {
            this.add_thought_card(guiTask, true);
        }
    }

    private is_memory(task: Task): boolean {
        // A belief becomes a "memory" if it's verified or has high confidence
        return task.type === TaskType.BELIEF && (task.verified || (task.truth && task.truth.confidence > 0.9));
    }

    public render() {
        const memories = Object.values(this.gui.world_model.tasks)
            .filter(task => this.is_memory(task));
        const guiTasks = memories.map(task => this.gui.renderer.map_task_to_gui_task(task));
        this.container.innerHTML = guiTasks.map(t => this.gui.renderer.renderThoughtCard(t, true)).join('');
    }
}
