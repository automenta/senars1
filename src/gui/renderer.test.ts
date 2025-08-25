import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { Renderer } from './renderer';
import { Gui } from './index';
import { WorldModel } from '../core/world-model';
import { Agenda } from '../core/agenda';
import { SchemaRegistry } from '../core/schema-registry';
import { App } from '../app';
import { Task, SemanticAtom } from '../core/models';
import { TaskType } from '../core/types';
import { v4 as uuidv4 } from 'uuid';

// Mock Gui and its dependencies
vi.mock('./index');
vi.mock('../core/world-model');
vi.mock('../core/agenda');
vi.mock('../core/schema-registry');
vi.mock('../app');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;
global.HTMLElement = dom.window.HTMLElement;

describe('Renderer', () => {
    let renderer: Renderer;
    let mockGui: any;
    let mockWorldModel: any;
    let mockAgenda: any;

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        const atom1: SemanticAtom = { id: uuidv4(), content: 'Atom 1', embedding: [] };
        const task1: Task = {
            id: uuidv4(),
            atom_id: atom1.id,
            type: TaskType.BELIEF,
            attention: { priority: 0.8, durability: 0.8 },
            truth: { frequency: 1, confidence: 0.9 },
            stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' },
        };

        mockWorldModel = {
            tasks: { [task1.id]: task1 },
            get_atom: vi.fn().mockReturnValue(atom1),
            get_task: vi.fn().mockReturnValue(task1),
        };

        mockAgenda = {
            get_all_tasks: vi.fn().mockResolvedValue([task1]),
        };

        mockGui = {
            world_model: mockWorldModel,
            agenda: mockAgenda,
            schema_registry: { get_all: vi.fn().mockReturnValue([]) },
            app: {
                last_scope_bindings: undefined,
                last_scope_task: undefined,
                is_task_pinned: vi.fn().mockReturnValue(false),
                emit: vi.fn(),
            },
            activeThoughtsComponent: { render: vi.fn().mockResolvedValue(undefined) },
            completedThoughtsComponent: { render: vi.fn().mockResolvedValue(undefined) },
            memoryComponent: { render: vi.fn().mockResolvedValue(undefined) },
            metricsComponent: { render: vi.fn().mockResolvedValue(undefined) },
            schemaList: document.createElement('div'),
            scopeDebugger: document.createElement('div'),
            lastEnergyLevel: 0,
            state: { currentMode: 'thinking', pinnedTaskIds: new Set() }
        };

        renderer = new Renderer(mockGui as Gui);
    });

    it('should be created', () => {
        expect(renderer).toBeInstanceOf(Renderer);
    });

    it('should render without errors', async () => {
        await expect(renderer.render()).resolves.not.toThrow();
    });
});
