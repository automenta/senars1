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
        // Centralized click handler using event delegation
        this.gui.container.addEventListener('click', this.handle_container_click.bind(this));

        // Other top-level listeners
        this.gui.userModeSelect.addEventListener('change', this.handle_user_mode_change.bind(this));
        this.gui.newThoughtInput.addEventListener('keydown', this.handle_new_thought_keypress.bind(this));

        // Listen for re-renders to attach gesture listeners
        this.gui.app.on('render_complete', this.attach_gesture_listeners.bind(this));

        this.gui.app.on('suggestion_generated', (data: { question: string }) => {
            this.gui.renderer.render_suggestion(data.question);
        });
    }

    private async handle_container_click(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const action_element = target.closest('[data-action]');

        if (!action_element) return;

        const action = action_element.getAttribute('data-action');
        const task_id = action_element.getAttribute('data-task-id');

        switch (action) {
            case 'add-new-thought':
                await this.add_new_thought();
                break;
            case 'open-settings':
                this.open_settings();
                break;
            case 'close-settings':
                this.close_settings();
                break;
            case 'save-llm-config':
                this.save_llm_config();
                break;
            // Active Thought Actions
            case 'boost-task':
                if (task_id) await this.gui.app.boost_task(task_id);
                break;
            case 'reduce-task':
                if (task_id) await this.gui.app.reduce_task_priority(task_id);
                break;
            // Completed Thought (Belief) Actions
            case 'verify-belief':
                if (task_id) await this.gui.app.verify_belief(task_id);
                break;
            case 'dispute-belief':
                if (task_id) await this.gui.app.dispute_belief(task_id);
                break;
            case 'star-belief':
                if (task_id) await this.gui.app.star_belief(task_id);
                break;
            case 'question-belief':
                if (task_id) this.gui.app.question_belief(task_id);
                break;
            case 'forget-belief':
                if (task_id) this.gui.app.forget_belief(task_id);
                break;
        }
    }

    private async handle_user_mode_change(event: Event) {
        this.gui.currentMode = (event.target as HTMLSelectElement).value;
        this.gui.container.dataset.mode = this.gui.currentMode;
        await this.gui.renderer.render(); // Keep this one as it's a global UI change
    }

    private async handle_new_thought_keypress(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            await this.add_new_thought();
        }
    }

    private async add_new_thought() {
        const content = this.gui.newThoughtInput.value.trim();
        if (content) {
            const type = content.endsWith('?') ? TaskType.GOAL : TaskType.BELIEF;
            await this.gui.app.add_new_thought(content, type);
            this.gui.newThoughtInput.value = '';
            // No need to render here, the event bus will handle it
        }
    }

    private open_settings() {
        const currentConfig = this.gui.app.get_config().llm;
        this.gui.llmApiKeyInput.value = currentConfig.apiKey || '';
        this.gui.llmModelNameInput.value = currentConfig.modelName || '';
        this.gui.settingsModal.style.display = 'block';
    }

    private close_settings() {
        this.gui.settingsModal.style.display = 'none';
    }

    private save_llm_config() {
        const config = {
            apiKey: this.gui.llmApiKeyInput.value,
            modelName: this.gui.llmModelNameInput.value
        };
        if (!config.apiKey || !config.modelName) {
            this.gui.llmConfigStatus.textContent = 'API Key and Model Name are required.';
            this.gui.llmConfigStatus.style.color = 'red';
            return;
        }
        localStorage.setItem('llm_config', JSON.stringify(config));
        this.gui.app.update_llm_config(config);
        this.gui.llmConfigStatus.textContent = 'Configuration saved!';
        this.gui.llmConfigStatus.style.color = 'green';
        setTimeout(() => {
            this.gui.llmConfigStatus.textContent = '';
            this.close_settings();
        }, 1500);
    }

    private attach_gesture_listeners() {
        const cards = document.querySelectorAll('.thought-card');
        cards.forEach(card => {
            const element = card as HTMLElement;
            if (this.hammer_instances.has(element)) return;

            const hammer = new Hammer(element);
            const taskId = element.dataset.taskId;
            if (!taskId) return;

            hammer.on('press', async () => {
                await this.gui.app.pin_task(taskId);
            });

            hammer.on('swiperight', async () => {
                await this.gui.app.boost_task(taskId);
            });

            hammer.on('swipeleft', async () => {
                await this.gui.app.reduce_task_priority(taskId);
            });

            this.hammer_instances.set(element, hammer);
        });
    }
}
