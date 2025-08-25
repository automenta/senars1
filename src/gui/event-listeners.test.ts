import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { EventListeners } from './event-listeners';
import { Gui } from './index';
import { App } from '../app';
import { promises as fs } from 'fs';
import path from 'path';

// Mock Gui and App
vi.mock('./index');
vi.mock('../app');

describe('EventListeners', () => {
    let eventListeners: EventListeners;
    let mockGui: any;
    let mockApp: any;

    beforeEach(async () => {
        const html = await fs.readFile(path.resolve(__dirname, '../../index.html'), 'utf-8');
        const dom = new JSDOM(html, { url: 'http://localhost' });
        global.document = dom.window.document;
        global.window = dom.window as unknown as Window & typeof globalThis;
        global.localStorage = dom.window.localStorage;
        global.HTMLSelectElement = dom.window.HTMLSelectElement;

        vi.clearAllMocks();

        mockApp = {
            get_config: vi.fn().mockReturnValue({ llm: { apiKey: 'old-key', modelName: 'old-model' } }),
            update_llm_config: vi.fn(),
        };

        const mockGuiManager = {
            get_llm_config: vi.fn().mockReturnValue(mockApp.get_config().llm),
            update_llm_config: vi.fn(),
            add_new_thought: vi.fn().mockResolvedValue(undefined),
            boost_task: vi.fn().mockResolvedValue(undefined),
            reduce_task_priority: vi.fn().mockResolvedValue(undefined),
            verify_belief: vi.fn().mockResolvedValue(undefined),
            dispute_belief: vi.fn().mockResolvedValue(undefined),
            star_belief: vi.fn().mockResolvedValue(undefined),
            question_belief: vi.fn(),
            forget_belief: vi.fn(),
        };

        mockGui = {
            guiManager: mockGuiManager,
            event_bus: { on: vi.fn(), emit: vi.fn() },
            settingsBtn: document.getElementById('settings-btn'),
            settingsModal: document.getElementById('settings-modal'),
            llmApiKeyInput: document.getElementById('llm-api-key'),
            llmModelNameInput: document.getElementById('llm-model-name'),
            saveLlmConfigBtn: document.getElementById('save-llm-config-btn'),
            llmConfigStatus: document.getElementById('llm-config-status'),
            closeModalBtn: document.querySelector('.close-btn'),
            newThoughtInput: document.getElementById('new-thought-input'),
            addNewThoughtButton: document.getElementById('add-new-thought-button'),
            userModeSelect: document.getElementById('user-mode-select'),
            workerCountSlider: document.getElementById('worker-count-slider'),
            simulationSpeedSlider: document.getElementById('simulation-speed-slider'),
            completedThoughtsList: document.getElementById('completed-thoughts-list'),
            activeThoughtsList: document.getElementById('active-thoughts-list'),
            container: document.body,
            renderer: {
                render: vi.fn().mockResolvedValue(undefined),
                render_suggestion: vi.fn(),
            },
            notificationComponent: {
                show: vi.fn(),
            },
            settingsModalComponent: {
                show: vi.fn(),
                hide: vi.fn(),
                save_llm_config: vi.fn(),
            }
        };

        eventListeners = new EventListeners(mockGui as Gui);
        eventListeners.attach_event_listeners();
    });

    it('should delegate opening settings to the component', () => {
        const settingsBtn = document.getElementById('settings-btn')!;

        // Simulate a click
        settingsBtn.click();

        expect(mockGui.settingsModalComponent.show).toHaveBeenCalled();
    });

    it('should delegate saving config to the component', () => {
        const saveBtn = document.getElementById('save-llm-config-btn')!;

        // Simulate a click
        saveBtn.click();

        expect(mockGui.settingsModalComponent.save_llm_config).toHaveBeenCalled();
    });
});
