import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../../app';
import { Gui } from '../../gui';
import { GuiManager } from '../../gui/gui-manager';
import { Task, SemanticAtom } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { TaskType } from '../types';
import { SExpression, parseSExpression } from '../s-expression';
import { sleep } from '../utils';

import { promises as fs } from 'fs';
import path from 'path';

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
                // When asked to process, return a canned derived task and its new atom
                const newAtom: SemanticAtom = {
                    id: uuidv4(),
                    content: '(has cat warm_blood)',
                    embedding: [],
                };

                const derivedTask: Task = {
                    id: uuidv4(),
                    atom_id: newAtom.id, // The new task references the new atom
                    type: TaskType.BELIEF,
                    attention: { priority: 0.8, durability: 0.8 },
                    stamp: {
                        timestamp: Date.now() / 1000,
                        parent_ids: [msg.payload.task.id],
                        schema_id: 'deduction-schema-id'
                    },
                };

                // The payload must now match the structure expected by WorkerPool
                this.onmessage({
                    data: {
                        type: 'result',
                        payload: {
                            derivedTasks: [derivedTask],
                            newAtoms: [newAtom], // Include the new atom here
                            parentTaskId: msg.payload.task.id
                        }
                    }
                });
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

    const trigger_task: Task = {
        id: uuidv4(),
        atom_id: premise_atom.id,
        type: TaskType.GOAL,
        attention: { priority: 0.9, durability: 0.9 },
        stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' },
    };
    await app.agenda.push(trigger_task);

    // 2. Action: Manually run the dispatch loop which sends the task to the mock worker
    await gui.dispatchTasks();

    // Wait for the mock worker to "process" and post back the result
    await sleep(50);

    // 3. Assertion: Check if the derived task was added to the agenda
    const agenda_tasks = await app.agenda.get_all_tasks();
    const derived_task = agenda_tasks.find(t => t.stamp.parent_ids.includes(trigger_task.id));

    expect(derived_task).toBeDefined();
    expect(derived_task?.type).toBe(TaskType.BELIEF);

    // Also assert that the new atom was added to the main world model
    const new_atom_from_model = app.world_model.get_atom(derived_task!.atom_id);
    expect(new_atom_from_model).toBeDefined();
    expect(new_atom_from_model.content).toBe('(has cat warm_blood)');

  }, 1000); // Increase timeout for this integration test
});
