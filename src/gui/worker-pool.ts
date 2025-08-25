import { App } from '../app';
import { Task } from '../core/models';
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
    private app: App;
    private pool: WorkerState[] = [];
    private workerScriptUrl: string;
    private desiredSize: number;

    // A queue for tasks that are waiting for a free worker
    private dispatchQueue: string[] = [];

    private completedTasksCounter: number = 0;
    private lastTpsResetTimestamp: number = Date.now();
    private lastTpsValue: number = 0;

    constructor(app: App, workerScriptUrl: string, size: number = 1) {
        this.app = app;
        this.workerScriptUrl = workerScriptUrl;
        this.desiredSize = size;

        // Listen for when a belief is added to the main world model
        // so we can broadcast the updated state to all workers.
        this.app.on('belief_added_to_world_model', () => this.broadcastWorldModel());
        this.app.on('belief_updated_in_world_model', () => this.broadcastWorldModel());
    }

    /**
     * Creates the initial set of workers and waits for them to be ready.
     */
    public async init(): Promise<void> {
        this.pool = [];
        const readyPromises = [];
        for (let i = 0; i < this.desiredSize; i++) {
            readyPromises.push(this.addWorker());
        }
        await Promise.all(readyPromises);
    }

    /**
     * Creates a new worker, initializes it, and adds it to the pool.
     * Returns a promise that resolves when the worker is ready.
     */
    private addWorker(): Promise<void> {
        return new Promise((resolve) => {
            const worker = new Worker(this.workerScriptUrl, { type: 'module' });
            const workerState: WorkerState = { worker, isBusy: true };
            this.pool.push(workerState);

            worker.onmessage = (event) => {
                // The first 'ready' message resolves the promise
                if (event.data.type === 'ready' && workerState.isBusy) {
                    resolve();
                }
                this.handleWorkerMessage(workerState, event);
            };
            worker.onerror = (error) => {
                console.error("A worker has crashed:", error);
                workerState.isBusy = false; // Mark as not busy so it can be replaced or restarted
            };

            // Send the configuration needed for the worker to initialize its own engine
            const config = this.app.get_config();
            worker.postMessage({ type: 'init', payload: { config } });
        });
    }

    /**
     * Handles all messages coming from a specific worker.
     */
    private handleWorkerMessage(workerState: WorkerState, event: MessageEvent) {
        const { type, payload } = event.data;

        switch (type) {
            case 'ready':
                console.log("Worker is ready.");
                workerState.isBusy = false;
                // Send the initial world model state to the newly ready worker
                this.broadcastWorldModel(workerState.worker);
                break;
            case 'result':
                this.handleTaskResult(payload);
                workerState.isBusy = false;
                break;
            case 'error':
                console.error("Error reported from worker:", payload.error);
                // TODO: Implement more robust error handling, e.g., creating an error task
                workerState.isBusy = false;
                break;
        }
    }

    /**
     * Processes the results of a completed task from a worker.
     */
    private async handleTaskResult(payload: { derivedTasks: Task[], parentTaskId: string }) {
        this.completedTasksCounter++;
        console.log(`Worker result: Got ${payload.derivedTasks.length} derived tasks from parent ${payload.parentTaskId}`);
        for (const task of payload.derivedTasks) {
            await this.app.agenda.push(task);
        }
    }

    /**
     * Dispatches a task to the first available worker.
     * If no workers are free, the task is ignored for this cycle.
     * The main loop should handle requeueing or trying again.
     */
    public dispatchTask(task: Task) {
        const freeWorkerState = this.pool.find(ws => !ws.isBusy);
        if (freeWorkerState) {
            freeWorkerState.isBusy = true;
            freeWorkerState.worker.postMessage({ type: 'process', payload: { task } });
        } else {
            // If all workers are busy, we'll just have to wait for the next cycle.
            // The task remains in the agenda.
        }
    }

    /**
     * Sends the current state of the world model to one or all workers.
     */
    public broadcastWorldModel(worker?: Worker) {
        const snapshot = {
            atoms: this.app.world_model.atoms,
            tasks: this.app.world_model.tasks, // Only BELIEFS are in the world model tasks
        };
        const message = { type: 'update_world_model', payload: snapshot };

        if (worker) {
            // Send to a specific worker (e.g., after it initializes)
            worker.postMessage(message);
        } else {
            // Send to all workers in the pool
            this.pool.forEach(ws => ws.worker.postMessage(message));
        }
    }

    /**
     * Changes the size of the worker pool, adding or removing workers as needed.
     */
    public setSize(newSize: number) {
        this.desiredSize = newSize;
        const currentSize = this.pool.length;

        if (newSize > currentSize) {
            // Add new workers
            for (let i = 0; i < newSize - currentSize; i++) {
                this.addWorker();
            }
        } else if (newSize < currentSize) {
            // Remove excess workers
            const workersToRemove = this.pool.splice(newSize);
            for (const workerState of workersToRemove) {
                workerState.worker.terminate();
            }
        }
    }

    /**
     * Returns the number of workers that are not currently processing a task.
     */
    public getFreeWorkerCount(): number {
        return this.pool.filter(w => !w.isBusy).length;
    }

    /**
     * Returns the total number of workers in the pool.
     */
    public getSize(): number {
        return this.pool.length;
    }

    /**
     * Calculates and returns the number of tasks processed per second.
     * This value is updated once per second.
     */
    public getTasksPerSecond(): number {
        const now = Date.now();
        const elapsed = now - this.lastTpsResetTimestamp;

        if (elapsed > 1000) { // Update every second
            this.lastTpsValue = (this.completedTasksCounter / (elapsed / 1000));
            this.completedTasksCounter = 0;
            this.lastTpsResetTimestamp = now;
        }

        return this.lastTpsValue;
    }
}
