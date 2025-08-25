import { Gui } from '../index';

export class SettingsModalComponent {
    private gui: Gui;

    // DOM Elements
    private settingsModal: HTMLElement;
    private closeModalBtn: HTMLElement;
    private llmApiKeyInput: HTMLInputElement;
    private llmModelNameInput: HTMLInputElement;
    private saveLlmConfigBtn: HTMLElement;

    constructor(gui: Gui) {
        this.gui = gui;

        // Cache all DOM element selections
        this.settingsModal = document.getElementById('settings-modal')!;
        this.closeModalBtn = this.settingsModal.querySelector('.close-btn')!;
        this.llmApiKeyInput = document.getElementById('llm-api-key') as HTMLInputElement;
        this.llmModelNameInput = document.getElementById('llm-model-name') as HTMLInputElement;
        this.saveLlmConfigBtn = document.getElementById('save-llm-config-btn')!;

        this.attach_event_listeners();
    }

    private attach_event_listeners() {
        document.getElementById('settings-btn')?.addEventListener('click', () => this.open_settings());
        this.closeModalBtn.addEventListener('click', () => this.close_settings());
        this.saveLlmConfigBtn.addEventListener('click', () => this.save_llm_config());
    }

    public open_settings() {
        const currentConfig = this.gui.app.get_config().llm;
        this.llmApiKeyInput.value = currentConfig.apiKey || '';
        this.llmModelNameInput.value = currentConfig.modelName || '';
        this.settingsModal.classList.add('is-visible');
    }

    public close_settings() {
        this.settingsModal.classList.remove('is-visible');
    }

    private save_llm_config() {
        const config = {
            apiKey: this.llmApiKeyInput.value,
            modelName: this.llmModelNameInput.value
        };
        if (!config.apiKey || !config.modelName) {
            this.gui.notificationComponent.show('API Key and Model Name are required.', 'error');
            return;
        }
        localStorage.setItem('llm_config', JSON.stringify(config));
        this.gui.app.update_llm_config(config);
        this.gui.notificationComponent.show('Configuration saved!', 'success');
        this.close_settings();
    }
}
