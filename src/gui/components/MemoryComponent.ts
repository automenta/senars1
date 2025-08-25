import { Gui } from '../index';
import { ThoughtListComponent } from './ThoughtListComponent';
import { Task } from '../../core/models';
import { TaskType } from '../../core/types';

export class MemoryComponent extends ThoughtListComponent {
    constructor(gui: Gui) {
        super(gui, 'memory-list');
        // Initial render
        this.render();
    }

    protected subscribe_to_events(): void {
        // Any change in beliefs could affect what qualifies as a "memory".
        // So, we re-render on all belief-related events.
        this.gui.event_bus.on('belief_added_to_world_model', () => this.render());
        this.gui.event_bus.on('belief_updated_in_world_model', () => this.render());
        this.gui.event_bus.on('belief_removed_from_world_model', () => this.render());

        // Also re-render when the mode changes.
        this.gui.event_bus.on('mode_changed', () => this.render());
    }

    /**
     * A belief is considered a "memory" if it is verified by the user
     * or has a very high confidence level.
     */
    private is_memory(task: Task): boolean {
        const memoryThreshold = 0.9;
        return task.type === TaskType.BELIEF &&
               (task.verified || (task.truth && task.truth.confidence > memoryThreshold));
    }

    public render() {
        const memories = Object.values(this.gui.world_model.tasks)
            .filter(task => this.is_memory(task));

        // Sort memories by confidence (descending)
        memories.sort((a, b) => (b.truth?.confidence || 0) - (a.truth?.confidence || 0));

        const guiTasks = memories.map(task => this.gui.renderer.map_task_to_gui_task(task));

        // Render a simplified version for the memory list.
        // For now, we use the standard thought card, but this could be changed later.
        this.container.innerHTML = '';
        guiTasks.forEach(t => {
            // Here we could use a different renderer, e.g., `renderMemoryCard`,
            // but for now we'll reuse the standard thought card.
            const cardHTML = this.gui.renderer.renderThoughtCard(t, true);
            this.container.insertAdjacentHTML('beforeend', cardHTML);
        });

        // No need to emit 'render_complete' here if we don't expect gestures on memory items.
    }
}
