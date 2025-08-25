import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { EventListeners } from './event-listeners';
import { Gui } from './index';
import { App } from '../app';

// Mock Gui and App
vi.mock('./index');
vi.mock('../app');

const dom = new JSDOM(`
  <!doctype html>
  <html>
    <body>
      <button id="settings-btn"></button>
      <div id="settings-modal" style="display: none;">
        <input id="llm-api-key" value="test-key" />
        <input id="llm-model-name" value="test-model" />
        <button id="save-llm-config-btn"></button>
        <p id="llm-config-status"></p>
        <span class="close-btn"></span>
      </div>
       <input id="new-thought-input" />
       <button id="add-new-thought-button"></button>
       <select id="user-mode-select"></select>
       <div id="completed-thoughts-list"></div>
       <div id="active-thoughts-list"></div>
    </body>
  </html>
`, { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;
global.localStorage = dom.window.localStorage;
global.HTMLSelectElement = dom.window.HTMLSelectElement;

describe('EventListeners', () => {
    let eventListeners: EventListeners;
    let mockGui: any;
    let mockApp: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApp = {
            get_config: vi.fn().mockReturnValue({ llm: { apiKey: 'old-key', modelName: 'old-model' } }),
            update_llm_config: vi.fn(),
            on: vi.fn(),
            // Mock other methods called by listeners if necessary
            add_new_thought: vi.fn().mockResolvedValue(undefined),
        };

        mockGui = {
            app: mockApp,
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
            completedThoughtsList: document.getElementById('completed-thoughts-list'),
            activeThoughtsList: document.getElementById('active-thoughts-list'),
            container: document.body,
            renderer: {
                render: vi.fn().mockResolvedValue(undefined),
                render_suggestion: vi.fn(),
            }
        };

        eventListeners = new EventListeners(mockGui as Gui);
        eventListeners.attach_event_listeners();
    });

    it('should save LLM config when save button is clicked', () => {
        // Simulate user input
        (mockGui.llmApiKeyInput as HTMLInputElement).value = 'new-api-key';
        (mockGui.llmModelNameInput as HTMLInputElement).value = 'new-model';

        // Directly call the handler logic
        eventListeners['save_llm_config']();

        // Assert localStorage was called
        expect(localStorage.getItem('llm_config')).toBe(JSON.stringify({
            apiKey: 'new-api-key',
            modelName: 'new-model'
        }));

        // Assert app method was called
        expect(mockApp.update_llm_config).toHaveBeenCalledWith({
            apiKey: 'new-api-key',
            modelName: 'new-model'
        });

        // Assert status message is shown
        expect(mockGui.llmConfigStatus.textContent).toContain('Configuration saved');
    });

    it('should open settings modal when settings button is clicked', () => {
        mockGui.settingsModal.style.display = 'none';

        // Directly call the handler logic
        eventListeners['open_settings']();

        expect(mockGui.settingsModal.style.display).toBe('block');
        // Check that it pre-populates the fields
        expect((mockGui.llmApiKeyInput as HTMLInputElement).value).toBe('old-key');
        expect((mockGui.llmModelNameInput as HTMLInputElement).value).toBe('old-model');
    });
});
