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
import { EventBus } from './EventBus';
import { SettingsModalComponent } from './components/SettingsModalComponent';
import { NotificationComponent } from './components/NotificationComponent';
import { MetricsComponent } from './components/MetricsComponent';
import { ActiveThoughtsComponent } from './components/ActiveThoughtsComponent';
import { CompletedThoughtsComponent } from './components/CompletedThoughtsComponent';

export class Gui {
  world_model: WorldModel;
  agenda: Agenda;
  schema_registry: SchemaRegistry;
  app: App;
  renderer: Renderer;
  event_bus: EventBus;
  event_listeners: EventListeners;
  settingsModalComponent: SettingsModalComponent;
  notificationComponent: NotificationComponent;
  metricsComponent: MetricsComponent;
  activeThoughtsComponent: ActiveThoughtsComponent;
  completedThoughtsComponent: CompletedThoughtsComponent;

  // DOM Elements
  schemaList: HTMLElement;
  scopeDebugger: HTMLElement;
  newThoughtInput: HTMLInputElement;
  addNewThoughtButton: HTMLElement;
  userModeSelect: HTMLSelectElement;
  container: HTMLElement;

  state: {
    currentMode: string;
    pinnedTaskIds: Set<string>;
  };
  lastEnergyLevel: number = 0;

  constructor(app: App, world_model: WorldModel, agenda: Agenda, schema_registry: SchemaRegistry) {
    this.state = {
      currentMode: 'thinking',
      pinnedTaskIds: new Set(),
    };
    this.app = app;
    this.world_model = world_model;
    this.agenda = agenda;
    this.schema_registry = schema_registry;
    this.event_bus = new EventBus();
    this.renderer = new Renderer(this);
    this.event_listeners = new EventListeners(this);
    this.notificationComponent = new NotificationComponent();
    this.settingsModalComponent = new SettingsModalComponent(this);
    this.metricsComponent = new MetricsComponent(this);
    this.activeThoughtsComponent = new ActiveThoughtsComponent(this);
    this.completedThoughtsComponent = new CompletedThoughtsComponent(this);

    // Cache all DOM element selections
    this.schemaList = document.getElementById('schema-list')!;
    this.scopeDebugger = document.getElementById('scope-debugger-content')!;
    this.newThoughtInput = document.getElementById('new-thought-input') as HTMLInputElement;
    this.addNewThoughtButton = document.getElementById('add-new-thought-button')!;
    this.userModeSelect = document.getElementById('user-mode-select') as HTMLSelectElement;
    this.container = document.querySelector('.container')!;
  }

  public async init() {
    this.load_llm_config();
    this.bind_app_events_to_gui_events();
    this.event_listeners.attach_event_listeners();
    await this.renderer.render();
    this.event_bus.emit('render_complete', {});
  }

  private bind_app_events_to_gui_events() {
    const events_to_forward = [
        'task_added_to_agenda',
        'task_removed_from_agenda',
        'task_updated_in_agenda',
        'belief_added_to_world_model',
        'belief_updated_in_world_model',
        'belief_removed_from_world_model',
        'render_complete',
        'suggestion_generated',
        'user_thought_added'
    ];

    events_to_forward.forEach(event_name => {
        this.app.on(event_name, (data: any) => {
            // The data from app events can be structured like {task: ...} or just be the value itself.
            // We unpack it if necessary.
            const payload = data && typeof data === 'object' && Object.keys(data).length === 1 ? Object.values(data)[0] : data;
            this.event_bus.emit(event_name, payload);
        });
    });

    this.event_bus.on('user_thought_added', (data: { content: string, type: TaskType }) => {
        if (data.type === 'BELIEF') {
            this.app.generate_suggestion_for_belief(data.content);
        }
    });
  }

  private load_llm_config() {
      const configStr = localStorage.getItem('llm_config');
      if (configStr) {
          try {
            const config = JSON.parse(configStr);
            this.app.update_llm_config(config);
          } catch (e) {
            console.error("Failed to parse LLM config from localStorage", e);
            localStorage.removeItem('llm_config');
          }
      }
  }

  public set_mode(mode: string) {
    this.state.currentMode = mode;
    this.container.dataset.mode = mode;
    this.renderer.render();
    this.event_bus.emit('mode_changed', mode);
  }

  public pin_task(taskId: string) {
    if (this.state.pinnedTaskIds.has(taskId)) {
      this.state.pinnedTaskIds.delete(taskId);
    } else {
      this.state.pinnedTaskIds.add(taskId);
    }
    this.renderer.render();
  }

  public is_task_pinned(taskId: string): boolean {
    return this.state.pinnedTaskIds.has(taskId);
  }
}
