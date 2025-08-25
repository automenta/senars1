import { Gui } from './index';
import { TaskType } from '../core/types';
import Hammer from 'hammerjs';

export class EventListeners {
    private gui: Gui;

    constructor(gui: Gui) {
        this.gui = gui;
    }

    public attach_event_listeners() {
        this.gui.addNewThoughtButton.addEventListener('click', async () => {
            const content = this.gui.newThoughtInput.value.trim();
            if (content) {
                const type = content.endsWith('?') ? TaskType.GOAL : TaskType.BELIEF;
                await this.gui.app.add_new_thought(content, type);
                this.gui.newThoughtInput.value = '';
                await this.gui.renderer.render();
            }
        });

        this.gui.settingsBtn.addEventListener('click', () => {
            // Populate the modal with the current config
            const currentConfig = this.gui.app.get_config().llm;
            this.gui.llmApiKeyInput.value = currentConfig.apiKey || '';
            this.gui.llmModelNameInput.value = currentConfig.modelName || '';
            this.gui.settingsModal.style.display = 'block';
        });

        this.gui.closeModalBtn.addEventListener('click', () => {
            this.gui.settingsModal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target === this.gui.settingsModal) {
                this.gui.settingsModal.style.display = 'none';
            }
        });

        this.gui.userModeSelect.addEventListener('change', async (event) => {
            this.gui.currentMode = (event.target as HTMLSelectElement).value;
            this.gui.container.dataset.mode = this.gui.currentMode;
            await this.gui.renderer.render();
        });

        this.gui.saveLlmConfigBtn.addEventListener('click', () => {
            this.save_llm_config();
        });

        window.addEventListener('keydown', async (event) => {
            const activeCard = document.querySelector('.thought-card.active-card') as HTMLElement;
            if (!activeCard) return;

            const taskId = activeCard.dataset.taskId;
            if (!taskId) return;

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                await this.gui.app.boost_task(taskId);
                await this.gui.renderer.render();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                await this.gui.app.reduce_task_priority(taskId);
                await this.gui.renderer.render();
            }
        });

        this.attach_knowledge_action_listeners();
        this.attach_active_thought_listeners();
        this.attach_hold_listener();

        this.gui.app.on('suggestion_generated', (data: { question: string }) => {
            this.gui.renderer.render_suggestion(data.question);
        });
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
        this.gui.llmConfigStatus.textContent = 'Configuration saved! It will be applied on next reload or action.';
        this.gui.llmConfigStatus.style.color = 'green';
        setTimeout(() => {
            this.gui.llmConfigStatus.textContent = '';
        }, 3000);
    }

    private attach_knowledge_action_listeners() {
        this.gui.completedThoughtsList.addEventListener('click', async (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('.action-btn');
            if (!button) return;

            const taskId = button.dataset.taskId;
            if (!taskId) return;

            if (button.classList.contains('thumb-up-btn')) {
                await this.gui.app.verify_belief(taskId);
            } else if (button.classList.contains('thumb-down-btn')) {
                await this.gui.app.dispute_belief(taskId);
            } else if (button.classList.contains('star-btn')) {
                await this.gui.app.star_belief(taskId);
            } else if (button.classList.contains('question-btn')) {
                await this.gui.app.question_belief(taskId);
            } else if (button.classList.contains('forget-btn')) {
                await this.gui.app.forget_belief(taskId);
            }
            await this.gui.renderer.render();
        });
    }

    private attach_active_thought_listeners() {
        this.gui.activeThoughtsList.addEventListener('click', async (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('.feedback-btn');
            if (!button) return;

            const taskId = button.dataset.taskId;
            if (!taskId) return;

            if (button.classList.contains('thumb-up-btn')) {
                await this.gui.app.boost_task(taskId);
                await this.gui.renderer.render();
            } else if (button.classList.contains('thumb-down-btn')) {
                await this.gui.app.reduce_task_priority(taskId);
                await this.gui.renderer.render();
            }
        });

        const cards = this.gui.activeThoughtsList.querySelectorAll('.thought-card');
        cards.forEach(card => {
            const hammer = new Hammer(card as HTMLElement);
            const taskId = (card as HTMLElement).dataset.taskId;
            if (!taskId) return;

            hammer.on('swiperight', async () => {
                await this.gui.app.boost_task(taskId);
                await this.gui.renderer.render();
            });

            hammer.on('swipeleft', async () => {
                await this.gui.app.reduce_task_priority(taskId);
                await this.gui.renderer.render();
            });

            card.addEventListener('mouseenter', () => {
                document.querySelectorAll('.thought-card.active-card').forEach(c => c.classList.remove('active-card'));
                card.classList.add('active-card');
            });

            card.addEventListener('mouseleave', () => {
                card.classList.remove('active-card');
            });
        });
    }

    private attach_hold_listener() {
        const cards = this.gui.activeThoughtsList.querySelectorAll('.thought-card');
        cards.forEach(card => {
            const hammer = new Hammer(card as HTMLElement);
            const taskId = (card as HTMLElement).dataset.taskId;
            if (!taskId) return;

            hammer.on('press', async () => {
                await this.gui.app.pin_task(taskId);
                await this.gui.renderer.render();
            });
        });
    }
}
