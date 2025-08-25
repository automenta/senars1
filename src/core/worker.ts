// src/core/worker.ts
import { CognitiveEngine } from './engine';
import { WorldModel } from './world-model';
import { Agenda } from './agenda';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler, InMemoryPatternMatcher, QuestionGeneratorHandler } from './implementations';
import { ProcedureHandler, ICognitiveSchema } from './interfaces';
import { SchemaRegistry } from './schema-registry';
import { DeductionSchema } from './schemas/deduction';
import { AbductionSchema } from './schemas/abduction';
import { InductionSchema } from './schemas/induction';
import { SafetyAnalysisSchema } from './schemas/safety_analysis';
// SelfSafetySchema is being replaced by a direct implementation in the worker
// import { SelfSafetySchema } from './schemas/self_safety';
import { ThoughtExpansionSchema } from './schemas/thought_expansion';
import { Task, SemanticAtom } from './models';
import { Config } from './config';
import { v4 as uuidv4 } from 'uuid';

let engine: CognitiveEngine;
let worldModel: WorldModel;
let attentionPolicy: DefaultAttentionPolicy;
let truthPolicy: DefaultTruthPolicy;
let resonanceStrategy: DefaultResonanceStrategy;
let schemaRegistry: SchemaRegistry;
let procedureHandlers: Record<string, ProcedureHandler>;
let inductionSchema: InductionSchema;

// A stripped-down version of the main App class for the worker context
class WorkerApp {
    constructor(config: Config) {
        attentionPolicy = new DefaultAttentionPolicy();
        truthPolicy = new DefaultTruthPolicy();
        resonanceStrategy = new DefaultResonanceStrategy();
        procedureHandlers = {};

        const patternMatcher = new InMemoryPatternMatcher();
        schemaRegistry = new SchemaRegistry(patternMatcher);

        // WorldModel and Agenda are lightweight here; they get populated by the main thread
        worldModel = new WorldModel(this as any, resonanceStrategy, truthPolicy, schemaRegistry, patternMatcher);
        const agenda = new Agenda(this as any);

        const llmHandler = new LLMHandler(config.llm, this as any);
        procedureHandlers[llmHandler.name()] = llmHandler;

        const questionGeneratorHandler = new QuestionGeneratorHandler(this as any, llmHandler);
        procedureHandlers[questionGeneratorHandler.name()] = questionGeneratorHandler;

        inductionSchema = new InductionSchema();

        engine = new CognitiveEngine(
            worldModel,
            agenda,
            attentionPolicy,
            truthPolicy,
            procedureHandlers,
            schemaRegistry,
            inductionSchema
        );

        // Register schemas
        schemaRegistry.register(new DeductionSchema());
        schemaRegistry.register(new AbductionSchema());
        schemaRegistry.register(new SafetyAnalysisSchema());
        // schemaRegistry.register(new SelfSafetySchema());
        schemaRegistry.register(new ThoughtExpansionSchema());
    }

    // A mock emit function, as workers don't have a GUI to update
    emit(eventName: string, data: any) {
        // In the future, this could post messages back for logging/debugging
    }
}

// The main message handler for the worker
self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'init':
            console.log('Worker: Initializing...');
            new WorkerApp(payload.config);
            self.postMessage({ type: 'ready' });
            break;

        case 'update_world_model':
            // Overwrite the worker's world model state with the latest from the main thread
            worldModel.atoms = payload.atoms;
            worldModel.tasks = payload.tasks;
            break;

        case 'process':
            const { task } = payload;
            console.log(`Worker: Processing task ${task.id}`);
            try {
                const derivedTasks = await processTask(task);
                self.postMessage({
                    type: 'result',
                    payload: {
                        derivedTasks,
                        parentTaskId: task.id
                    }
                });
            } catch (error) {
                console.error(`Worker: Error processing task ${task.id}`, error);
                self.postMessage({
                    type: 'error',
                    payload: {
                        error: (error as Error).message,
                        parentTaskId: task.id
                    }
                });
            }
            break;
    }
};

async function processTask(task_a: Task): Promise<Task[]> {
    let allDerivedTasks: Task[] = [];
    const DERIVATION_THRESHOLD = 20; // Safety threshold

    const context = worldModel.find_resonant(task_a, 10);
    const scope_bindings = resolveScopeBindings(task_a, context, worldModel);

    if (is_procedure_task(task_a, worldModel)) {
        const derived = await handle_procedure_task(task_a, scope_bindings);
        allDerivedTasks.push(...derived);
    } else {
        const single_premise_derived = await handle_single_premise_task(task_a, scope_bindings);
        const dual_premise_derived = await handle_dual_premise_task(task_a, context, scope_bindings);
        allDerivedTasks.push(...single_premise_derived, ...dual_premise_derived);
    }

    // Self-Safety Check: Did this task generate an excessive number of new tasks?
    if (allDerivedTasks.length > DERIVATION_THRESHOLD) {
        const parent_atom_content = worldModel.get_atom(task_a.atom_id).content;
        const warning_content = `(excessive_derivation_warning (parent_task "${parent_atom_content}") (derived_count ${allDerivedTasks.length}))`;

        const warning_atom: SemanticAtom = {
            id: uuidv4(),
            content: warning_content,
            embedding: [], // No embedding for internal warnings
        };
        // This has to be done on the main thread, but we can create the atom here
        // and the main thread can add it. For now, we just create the task.

        const warning_task: Task = {
            id: uuidv4(),
            atom_id: warning_atom.id, // This atom won't exist in the main model yet
            type: 'BELIEF',
            attention: { priority: 0.95, durability: 0.9 }, // High priority warning
            truth: { frequency: 1.0, confidence: 1.0 },
            stamp: {
                timestamp: Date.now() / 1000,
                parent_ids: [task_a.id],
                schema_id: uuidv4(), // Special ID for safety system
            },
            // A bit of a hack: include the atom itself so the main thread can add it.
            _atom_to_add: warning_atom
        };
        allDerivedTasks.push(warning_task);
    }

    return allDerivedTasks;
}

async function handle_procedure_task(task: Task, scope_bindings?: Record<string, string>): Promise<Task[]> {
    const results = await execute_procedure(
      task,
      worldModel,
      procedureHandlers,
      scope_bindings
    );

    const parent_atom = worldModel.get_atom(task.atom_id);
    const procedure_name = parent_atom.content.split(' ')[1].replace(/"/g, '');
    const new_path = (task.stamp.path || [parent_atom.content]).concat([`[Procedure: ${procedure_name}]`]);

    for (const result_task of results) {
      result_task.stamp = {
        timestamp: Date.now() / 1000,
        parent_ids: [task.id],
        schema_id: task.stamp.schema_id,
        scope_bindings: scope_bindings,
        path: new_path,
      };
    }
    return results;
}

async function handle_single_premise_task(task_a: Task, scope_bindings?: Record<string, string>): Promise<Task[]> {
    let derivedTasks: Task[] = [];
    const match_results = worldModel.find_single_premise_schemas(task_a);

    for (const match_result of match_results) {
        const schema = schemaRegistry.get(match_result.schema_id);
        if (!schema) continue;

        let derived: Task[] = [];
        if (scope_bindings) {
            derived = await schema.apply_with_bindings(task_a, undefined, truthPolicy, scope_bindings, worldModel, match_result.bindings);
        } else {
            derived = await schema.apply(task_a, undefined, truthPolicy, worldModel, match_result.bindings);
        }

        for (const new_task of derived) {
            enqueue_derived_task(new_task, task_a, undefined, schema.id, scope_bindings);
            derivedTasks.push(new_task);
        }
    }
    return derivedTasks;
}

async function handle_dual_premise_task(task_a: Task, context: Task[], scope_bindings?: Record<string, string>): Promise<Task[]> {
    let derivedTasks: Task[] = [];
    for (const task_b of context) {
        const schema_derived = await apply_dual_premise_schemas(task_a, task_b, scope_bindings);
        derivedTasks.push(...schema_derived);

        if (inductionSchema && task_a.type === 'BELIEF' && task_b.type === 'BELIEF') {
            const derived = await inductionSchema.apply(task_a, task_b, truthPolicy, worldModel, {});
            for (const new_task of derived) {
                enqueue_derived_task(new_task, task_a, task_b, inductionSchema.id, scope_bindings);
                derivedTasks.push(new_task);
            }
        }
    }
    return derivedTasks;
}

async function apply_dual_premise_schemas(task_a: Task, task_b: Task, scope_bindings?: Record<string, string>): Promise<Task[]> {
    let derivedTasks: Task[] = [];
    const match_results = worldModel.find_dual_premise_schemas(task_a, task_b);

    for (const match_result of match_results) {
        const schema = schemaRegistry.get(match_result.schema_id);
        if (!schema) continue;

        let derived: Task[] = [];
        if (scope_bindings) {
            derived = await schema.apply_with_bindings(task_a, task_b, truthPolicy, scope_bindings, worldModel, match_result.bindings);
        } else {
            derived = await schema.apply(task_a, task_b, truthPolicy, worldModel, match_result.bindings);
        }

        for (const new_task of derived) {
            enqueue_derived_task(new_task, task_a, task_b, schema.id, scope_bindings);
            derivedTasks.push(new_task);
        }
    }
    return derivedTasks;
}

function enqueue_derived_task(new_task: Task, parent_a: Task, parent_b: Task | undefined, schema_id: string, scope_bindings?: Record<string, string>) {
    if (new_task.type === 'BELIEF' && parent_b) {
        new_task.truth = truthPolicy.derivation(parent_a, parent_b, schema_id);
    }

    if (parent_b) {
        new_task.attention = attentionPolicy.calculate_derived(parent_a, parent_b, schema_id);
    } else {
        new_task.attention = {
            priority: parent_a.attention.priority * 0.9,
            durability: parent_a.attention.durability * 0.9
        };
    }

    const schema_name = schemaRegistry.get(schema_id)?.constructor.name || 'UnknownSchema';
    const parent_a_content = worldModel.get_atom(parent_a.atom_id).content;
    let base_path: string[] = parent_a.stamp.path || [parent_a_content];

    if (parent_b) {
        const parent_b_content = worldModel.get_atom(parent_b.atom_id).content;
        const path_b = parent_b.stamp.path;
        if (parent_a.stamp.path && path_b) {
            base_path = Array.from(new Set([...parent_a.stamp.path, ...path_b]));
        } else if (path_b) {
            base_path = path_b;
        } else {
            base_path = Array.from(new Set([parent_a_content, parent_b_content]));
        }
    }

    const new_path = base_path.concat([`[Schema: ${schema_name}]`]);

    new_task.stamp = {
        timestamp: Date.now() / 1000,
        parent_ids: parent_b ? [parent_a.id, parent_b.id] : [parent_a.id],
        schema_id: schema_id,
        scope_bindings: scope_bindings,
        path: new_path,
    };
}

console.log("Worker script loaded.");
