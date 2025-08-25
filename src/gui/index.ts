import Hammer from 'hammerjs';
import { App } from './app';
import { Task } from './core/models';
import { TaskType } from './core/types';
import { WorldModel } from './core/world-model';
import { Agenda } from './core/agenda';
import { SchemaRegistry } from './core/schema-registry';
import { is_procedure_task, extract_handler_name, extract_param } from '../core/procedure';
import { parseScopeExpression, substituteInContent } from '../core/scope';
import { GuiTask } from './types';
import { Renderer } from './renderer';
import { EventListeners } from './event-listeners';

export class Gui {
  world_model: WorldModel;
  agenda: Agenda;
  schema_registry: SchemaRegistry;
  app: App;
  renderer: Renderer;
  event_listeners: EventListeners;

  // DOM Elements
  activeThoughtsList: HTMLElement;
  completedThoughtsList: HTMLElement;
  schemaList: HTMLElement;
  scopeDebugger: HTMLElement;
  focusMetric: HTMLElement;
  activeThoughtsMetric: HTMLElement;
  memoryMetric: HTMLElement;
  energyTrendMetric: HTMLElement;
  highPriorityBar: HTMLElement;
  medPriorityBar: HTMLElement;
  lowPriorityBar: HTMLElement;
  highPriorityValue: HTMLElement;
  medPriorityValue: HTMLElement;
  lowPriorityValue: HTMLElement;
  newThoughtInput: HTMLInputElement;
  addNewThoughtButton: HTMLElement;
  settingsBtn: HTMLElement;
  settingsModal: HTMLElement;
  closeModalBtn: HTMLElement;
  userModeSelect: HTMLSelectElement;
  container: HTMLElement;
  llmApiKeyInput: HTMLInputElement;
  llmModelNameInput: HTMLInputElement;
  saveLlmConfigBtn: HTMLElement;
  llmConfigStatus: HTMLElement;

  currentMode: string = 'thinking';
  lastEnergyLevel: number = 0;

  constructor(app: App, world_model: WorldModel, agenda: Agenda, schema_registry: SchemaRegistry) {
    this.app = app;
    this.world_model = world_model;
    this.agenda = agenda;
    this.schema_registry = schema_registry;
    this.renderer = new Renderer(this);
    this.event_listeners = new EventListeners(this);

    // Cache all DOM element selections
    this.activeThoughtsList = document.getElementById('active-thoughts-list')!;
    this.completedThoughtsList = document.getElementById('completed-thoughts-list')!;
    this.schemaList = document.getElementById('schema-list')!;
    this.scopeDebugger = document.getElementById('scope-debugger-content')!;
    this.focusMetric = document.getElementById('focus-metric')!;
    this.activeThoughtsMetric = document.getElementById('active-thoughts-metric')!;
    this.memoryMetric = document.getElementById('memory-metric')!;
    this.energyTrendMetric = document.getElementById('energy-trend-metric')!;
    this.highPriorityBar = document.getElementById('high-priority-bar')!;
    this.medPriorityBar = document.getElementById('med-priority-bar')!;
    this.lowPriorityBar = document.getElementById('low-priority-bar')!;
    this.highPriorityValue = document.getElementById('high-priority-value')!;
    this.medPriorityValue = document.getElementById('med-priority-value')!;
    this.lowPriorityValue = document.getElementById('low-priority-value')!;
    this.newThoughtInput = document.getElementById('new-thought-input') as HTMLInputElement;
    this.addNewThoughtButton = document.getElementById('add-new-thought-button')!;
    this.settingsBtn = document.getElementById('settings-btn')!;
    this.settingsModal = document.getElementById('settings-modal')!;
    this.closeModalBtn = this.settingsModal.querySelector('.close-btn')!;
    this.userModeSelect = document.getElementById('user-mode-select') as HTMLSelectElement;
    this.container = document.querySelector('.container')!;
    this.llmApiKeyInput = document.getElementById('llm-api-key') as HTMLInputElement;
    this.llmModelNameInput = document.getElementById('llm-model-name') as HTMLInputElement;
    this.saveLlmConfigBtn = document.getElementById('save-llm-config-btn')!;
    this.llmConfigStatus = document.getElementById('llm-config-status')!;
  }

  public async init() {
    this.load_llm_config();
    this.event_listeners.attach_event_listeners();
    this.bind_to_app_events();
    await this.renderer.render();
    this.app.emit('render_complete', {});
  }

  private bind_to_app_events() {
    this.app.on('task_added_to_agenda', (data: { task: Task }) => {
        const guiTask = this.renderer['map_task_to_gui_task'](data.task);
        this.renderer.add_thought_card(guiTask, false);
        this.renderer['renderMetrics']();
    });

    this.app.on('task_removed_from_agenda', (data: { taskId: string }) => {
        this.renderer.remove_thought_card(data.taskId);
        this.renderer['renderMetrics']();
    });

    this.app.on('task_updated_in_agenda', (data: { task: Task }) => {
        const guiTask = this.renderer['map_task_to_gui_task'](data.task);
        this.renderer.update_thought_card(guiTask, false);
        this.renderer['renderMetrics']();
    });

    this.app.on('belief_added_to_world_model', (data: { task: Task }) => {
        const guiTask = this.renderer['map_task_to_gui_task'](data.task);
        this.renderer.add_thought_card(guiTask, true);
        this.renderer['renderMetrics']();
    });

    this.app.on('belief_updated_in_world_model', (data: { task: Task }) => {
        const guiTask = this.renderer['map_task_to_gui_task'](data.task);
        this.renderer.update_thought_card(guiTask, true);
        this.renderer['renderMetrics']();
    });

    this.app.on('belief_removed_from_world_model', (data: { taskId: string }) => {
        this.renderer.remove_thought_card(data.taskId);
        this.renderer['renderMetrics']();
    });
  }

  private load_llm_config() {
      const configStr = localStorage.getItem('llm_config');
      if (configStr) {
          try {
            const config = JSON.parse(configStr);
            this.llmApiKeyInput.value = config.apiKey || '';
            this.llmModelNameInput.value = config.modelName || '';
            this.app.update_llm_config(config);
            this.llmConfigStatus.textContent = 'Loaded saved configuration.';
          } catch (e) {
            console.error("Failed to parse LLM config from localStorage", e);
            localStorage.removeItem('llm_config');
          }
      }
  }
}
