import { Gui } from './index';
import { TaskType } from '../core/types';
import Hammer from 'hammerjs';

export class EventListeners {
    private gui: Gui;
    private hammer_instances: WeakMap<HTMLElement, HammerManager> = new WeakMap();

    constructor(gui: Gui) {
        this.gui = gui;
    }

    public attach_event_listeners() {
        // Centralized click handler using event delegation on the body
        document.body.addEventListener('click', this.handle_container_click.bind(this));

        // Other top-level listeners
        this.gui.userModeSelect.addEventListener('change', this.handle_user_mode_change.bind(this));
        this.gui.newThoughtInput.addEventListener('keydown', this.handle_new_thought_keypress.bind(this));
        this.gui.workerCountSlider.addEventListener('input', this.handle_worker_count_change.bind(this));
        this.gui.simulationSpeedSlider.addEventListener('input', this.handle_simulation_speed_change.bind(this));

        // Listen for re-renders to attach gesture listeners
        this.gui.event_bus.on('render_complete', this.attach_gesture_listeners.bind(this));

        this.gui.event_bus.on('suggestion_generated', (question: string) => {
            this.gui.renderer.render_suggestion(question);
        });
    }

    private handle_worker_count_change(event: Event) {
        const target = event.target as HTMLInputElement;
        const newSize = parseInt(target.value, 10);

        const valueElement = document.getElementById('worker-count-value');
        if (valueElement) {
            valueElement.textContent = String(newSize);
        }

        this.gui.workerPool.setSize(newSize);
    }

    private handle_simulation_speed_change(event: Event) {
        const target = event.target as HTMLInputElement;
        const newSpeed = parseInt(target.value, 10);

        const valueElement = document.getElementById('simulation-speed-value');
        if (valueElement) {
            valueElement.textContent = String(newSpeed);
        }

        this.gui.setSimulationSpeed(newSpeed);
    }

    private async handle_container_click(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const action_element = target.closest('[data-action]');

        if (!action_element) return;

        const action = action_element.getAttribute('data-action');
        const task_id = action_element.getAttribute('data-task-id');

        switch (action) {
            // Modal actions
            case 'open-settings':
                this.gui.settingsModalComponent.show();
                break;
            case 'close-settings':
                this.gui.settingsModalComponent.hide();
                break;
            case 'save-llm-config':
                this.gui.settingsModalComponent.save_llm_config();
                break;
            case 'add-new-thought':
                await this.add_new_thought();
                break;
            // Active Thought Actions
            case 'boost-task':
                if (task_id) await this.gui.guiManager.boost_task(task_id);
                break;
            case 'reduce-task':
                if (task_id) await this.gui.guiManager.reduce_task_priority(task_id);
                break;
            case 'pin-task':
                if (task_id) this.gui.pin_task(task_id);
                break;
            // Completed Thought (Belief) Actions
            case 'verify-belief':
                if (task_id) await this.gui.guiManager.verify_belief(task_id);
                break;
            case 'dispute-belief':
                if (task_id) await this.gui.guiManager.dispute_belief(task_id);
                break;
            case 'star-belief':
                if (task_id) await this.gui.guiManager.star_belief(task_id);
                break;
            case 'question-belief':
                if (task_id) {
                    const belief_task = this.gui.world_model.get_task(task_id);
                    const belief_content = this.gui.world_model.get_atom(belief_task.atom_id).content;
                    const question = `Why is "${belief_content}" true?`;
                    this.gui.newThoughtInput.value = question;
                    this.gui.newThoughtInput.focus();
                    this.gui.notificationComponent.show('Question ready in input box.', 'info');
                }
                break;
            case 'forget-belief':
                if (task_id) {
                    const belief_task = this.gui.world_model.get_task(task_id);
                    const belief_content = this.gui.world_model.get_atom(belief_task.atom_id).content;
                    this.gui.guiManager.forget_belief(task_id);
                    this.gui.notificationComponent.show(`Belief "${belief_content}" forgotten.`, 'info');
                }
                break;
        }
    }

    private async handle_user_mode_change(event: Event) {
        const newMode = (event.target as HTMLSelectElement).value;
        this.gui.set_mode(newMode);
    }

    private async handle_new_thought_keypress(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            await this.add_new_thought();
        }
    }

    private async add_new_thought() {
        const content = this.gui.newThoughtInput.value.trim();
        if (content) {
            // More sophisticated type detection
            const isGoal = content.endsWith('?') || /^(what|where|who|when|why|how|is|are|do|does)\s/i.test(content);
            const type = isGoal ? TaskType.GOAL : TaskType.BELIEF;

            await this.gui.guiManager.add_new_thought(content, type);
            this.gui.newThoughtInput.value = '';

            // Emit an event that a thought was added by the user
            this.gui.event_bus.emit('user_thought_added', { content, type });
        }
    }

    private attach_gesture_listeners() {
        const cards = document.querySelectorAll('.thought-card');
        cards.forEach(card => {
            const element = card as HTMLElement;
            if (this.hammer_instances.has(element)) return;

            const hammer = new Hammer(element);
            const taskId = element.dataset.taskId;
            if (!taskId) return;

            hammer.on('press', () => {
                this.gui.pin_task(taskId);
            });

            hammer.on('swiperight', async () => {
                await this.gui.guiManager.boost_task(taskId);
            });

            hammer.on('swipeleft', async () => {
                await this.gui.guiManager.reduce_task_priority(taskId);
            });

            this.hammer_instances.set(element, hammer);
        });
    }
}
