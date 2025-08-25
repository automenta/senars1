import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../../app';
import { Gui } from '../../gui';
import { GuiManager } from '../../gui/gui-manager';
import { Task } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { TaskType } from '../types';
import { SExpression, parseSExpression } from '../s-expression';
import { sleep } from '../utils';

import { promises as fs } from 'fs';
import path from 'path';
import { sleep } from '../utils';

// Mock the Worker class for the JSDOM environment
class MockWorker {
    onmessage: (event: any) => void = () => {};
    constructor(stringUrl: string) {}

    postMessage(msg: any) {
        // Simulate the async nature of workers
        setTimeout(() => {
            if (msg.type === 'init') {
                this.onmessage({ data: { type: 'ready' } });
            }
            if (msg.type === 'process') {
                // When asked to process, return a canned derived task
                const derivedTask: Task = {
                    id: uuidv4(),
                    atom_id: uuidv4(), // A new atom would be created
                    type: TaskType.BELIEF,
                    attention: { priority: 0.8, durability: 0.8 },
                    stamp: {
                        timestamp: Date.now() / 1000,
                        parent_ids: [msg.payload.task.id],
                        schema_id: 'deduction-schema-id'
                    },
                    // The real worker would also create a new atom
                    _atom_to_add: {
                        id: uuidv4(),
                        content: '(has cat warm_blood)',
                        embedding: [],
                    }
                };
                this.onmessage({ data: { type: 'result', payload: { derivedTasks: [derivedTask], parentTaskId: msg.payload.task.id } } });
            }
        }, 10); // 10ms delay to simulate work
    }
}


describe('Parallel Executor IntegrationTest', () => {
  let app: App;
  let gui: Gui;
  let guiManager: GuiManager;

  beforeEach(async () => {
    vi.stubGlobal('Worker', MockWorker);

    // Set up a full app and gui environment
    const html = await fs.readFile(path.resolve(__dirname, '../../../index.html'), 'utf-8');
    document.body.innerHTML = html;

    app = await App.create(false); // Create app without seed data
    guiManager = new GuiManager(app);
    gui = new Gui(guiManager, app.world_model, app.agenda, app.schema_registry);
    await gui.init();
  });

  it('should process a task in a worker and add the derived result to the agenda', async () => {
    // 1. Setup: Add a task that will be "processed" by the mock worker
    const premise_atom = { id: uuidv4(), content: '(is_a cat mammal)', embedding: [] };
    await app.world_model.add_atom(premise_atom);

    // 2. Action: Add a task to the agenda that will be sent to the worker
    const trigger_task: Task = {
        id: uuidv4(),
        atom_id: premise_atom.id,
        type: TaskType.GOAL,
        attention: { priority: 0.9, durability: 0.9 },
        stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' },
    };
    await app.agenda.push(trigger_task);

    // Manually run the dispatch loop
    await gui.dispatchTasks();

    // Wait for the mock worker to "process" the task
    await sleep(50);

    // 3. Assertion: Check if the canned derived task was added to the agenda
    const agenda_tasks = await app.agenda.get_all_tasks();
    const derived_task = agenda_tasks.find(t => t.stamp.parent_ids.includes(trigger_task.id));

    expect(derived_task).toBeDefined();
    expect(derived_task?.type).toBe(TaskType.BELIEF);

  }, 1000); // Increase timeout for this integration test
});
