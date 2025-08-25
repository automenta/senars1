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
    }

    public show() {
        const currentConfig = this.gui.guiManager.get_llm_config();
        this.llmApiKeyInput.value = currentConfig.apiKey || '';
        this.llmModelNameInput.value = currentConfig.modelName || '';
        this.settingsModal.classList.add('is-visible');
    }

    public hide() {
        this.settingsModal.classList.remove('is-visible');
    }

    public save_llm_config() {
        const config = {
            apiKey: this.llmApiKeyInput.value,
            modelName: this.llmModelNameInput.value
        };
        if (!config.apiKey || !config.modelName) {
            this.gui.notificationComponent.show('API Key and Model Name are required.', 'error');
            return;
        }
        localStorage.setItem('llm_config', JSON.stringify(config));
        this.gui.guiManager.update_llm_config(config);
        this.gui.notificationComponent.show('Configuration saved!', 'success');
        this.hide();
    }
}
