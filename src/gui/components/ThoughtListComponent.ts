import { Gui } from '../index';
import { GuiTask } from '../types';
import { Task } from '../../core/models';

export abstract class ThoughtListComponent {
    protected gui: Gui;
    protected container: HTMLElement;

    constructor(gui: Gui, containerId: string) {
        this.gui = gui;
        this.container = document.getElementById(containerId)!;
        this.subscribe_to_events();
    }

    protected abstract subscribe_to_events(): void;

    public add_thought_card(task: GuiTask, isCompleted: boolean) {
        const cardHTML = this.gui.renderer.renderThoughtCard(task, isCompleted);
        this.container.insertAdjacentHTML('afterbegin', cardHTML);
        this.gui.event_bus.emit('render_complete', {}); // For gestures
    }

    public remove_thought_card(taskId: string) {
        const card = this.container.querySelector(`.thought-card[data-task-id="${taskId}"]`);
        if (card) {
            card.remove();
        }
    }

    public update_thought_card(task: GuiTask, isCompleted: boolean) {
        this.remove_thought_card(task.id);
        this.add_thought_card(task, isCompleted);
    }

    public abstract render(): void;
}
