import { GuiManager } from './gui-manager';
import { Task, SemanticAtom } from '../core/models';
import { WorldModel } from '../core/world-model';

// Defines the state of a single worker in the pool
interface WorkerState {
    worker: Worker;
    isBusy: boolean;
}

/**
 * Manages a pool of Web Workers to process cognitive cycles in parallel.
 */
export class WorkerPool {
    private guiManager: GuiManager;
    private pool: WorkerState[] = [];
    private workerScriptUrl: string;
    private desiredSize: number;

    private completedTasksCounter: number = 0;
    private lastTpsResetTimestamp: number = Date.now();
    private lastTpsValue: number = 0;

    constructor(guiManager: GuiManager, workerScriptUrl: string, size: number = 1) {
        this.guiManager = guiManager;
        this.workerScriptUrl = workerScriptUrl;
        this.desiredSize = size;

        // When the main world model changes, broadcast the updated state to all workers.
        this.guiManager.on('belief_added_to_world_model', () => this.broadcastWorldModel());
        this.guiManager.on('belief_updated_in_world_model', () => this.broadcastWorldModel());
    }

    public async init(): Promise<void> {
        this.pool = [];
        const readyPromises = [];
        for (let i = 0; i < this.desiredSize; i++) {
            readyPromises.push(this.addWorker());
        }
        await Promise.all(readyPromises);
    }

    private addWorker(): Promise<void> {
        return new Promise((resolve) => {
            const worker = new Worker(this.workerScriptUrl, { type: 'module' });
            const workerState: WorkerState = { worker, isBusy: true };
            this.pool.push(workerState);

            worker.onmessage = (event) => {
                if (event.data.type === 'ready' && workerState.isBusy) {
                    resolve();
                }
                this.handleWorkerMessage(workerState, event);
            };
            worker.onerror = (error) => {
                console.error("A worker has crashed:", error);
                workerState.isBusy = false;
            };

            const config = this.guiManager.app.get_config();
            worker.postMessage({ type: 'init', payload: { config } });
        });
    }

    private handleWorkerMessage(workerState: WorkerState, event: MessageEvent) {
        const { type, payload } = event.data;

        switch (type) {
            case 'ready':
                workerState.isBusy = false;
                this.broadcastWorldModel(workerState.worker);
                break;
            case 'result':
                this.handleTaskResult(payload);
                workerState.isBusy = false;
                break;
            case 'error':
                console.error("Error from worker:", payload.error);
                workerState.isBusy = false;
                break;
        }
    }

    /**
     * Processes the results of a completed task from a worker.
     * This is a critical step to prevent race conditions. We must ensure
     * that any new SemanticAtoms created by the worker are added to the main
     * WorldModel *before* the tasks that reference them are added to the agenda.
     */
    private async handleTaskResult(payload: { derivedTasks: Task[], newAtoms: SemanticAtom[], parentTaskId: string, processedTask?: Task }) {
        this.completedTasksCounter++;

        // 1. Add all new atoms to the main world model.
        for (const atom of payload.newAtoms) {
            this.guiManager.app.world_model.add_atom(atom);
        }

        // 2. Add the processed task to the world model if it's a belief
        if (payload.processedTask && payload.processedTask.type === 'BELIEF') {
            await this.guiManager.app.world_model.add_task(payload.processedTask);
        }

        // 3. Now it is safe to add the derived tasks to the agenda.
        for (const task of payload.derivedTasks) {
            await this.guiManager.app.agenda.push(task);
        }
    }

    public dispatchTask(task: Task) {
        const freeWorkerState = this.pool.find(ws => !ws.isBusy);
        if (freeWorkerState) {
            freeWorkerState.isBusy = true;

            // Ensure the worker has the latest world model state before processing the task
            const snapshot = {
                atoms: this.guiManager.app.world_model.atoms,
                tasks: this.guiManager.app.world_model.tasks,
            };
            freeWorkerState.worker.postMessage({ type: 'update_world_model', payload: snapshot });

            // Now, send the task to be processed
            freeWorkerState.worker.postMessage({ type: 'process', payload: { task } });
        }
    }

    public broadcastWorldModel(worker?: Worker) {
        const snapshot = {
            atoms: this.guiManager.app.world_model.atoms,
            tasks: this.guiManager.app.world_model.tasks,
        };
        const message = { type: 'update_world_model', payload: snapshot };

        if (worker) {
            worker.postMessage(message);
        } else {
            this.pool.forEach(ws => ws.worker.postMessage(message));
        }
    }

    public setSize(newSize: number) {
        this.desiredSize = newSize;
        const currentSize = this.pool.length;

        if (newSize > currentSize) {
            for (let i = 0; i < newSize - currentSize; i++) {
                this.addWorker();
            }
        } else if (newSize < currentSize) {
            const workersToRemove = this.pool.splice(newSize);
            for (const workerState of workersToRemove) {
                workerState.worker.terminate();
            }
        }
    }

    public getFreeWorkerCount(): number {
        return this.pool.filter(w => !w.isBusy).length;
    }

    public getSize(): number {
        return this.pool.length;
    }

    public getTasksPerSecond(): number {
        const now = Date.now();
        const elapsed = now - this.lastTpsResetTimestamp;

        if (elapsed > 1000) {
            this.lastTpsValue = (this.completedTasksCounter / (elapsed / 1000));
            this.completedTasksCounter = 0;
            this.lastTpsResetTimestamp = now;
        }

        return this.lastTpsValue;
    }
}
