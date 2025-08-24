import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CognitiveEngine } from '../engine';
import { WorldModel } from '../world-model';
import { Agenda } from '../agenda';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, InMemoryPatternMatcher } from '../implementations';
import { SchemaRegistry } from '../schema-registry';
import { DeductionSchema, AbductionSchema, InductionSchema } from '../schemas';
import { Task, SemanticAtom } from '../models';
import { TaskType, UUID, ICognitiveSchema } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ITruthPolicy, ProcedureHandler } from '../interfaces';

// Mock LLM Handler
class MockLLMHandler implements ProcedureHandler {
    private canned_responses: Record<string, string>;
    constructor(canned_responses: Record<string, string>) { this.canned_responses = canned_responses; }
    name(): string { return "llm"; }
    can_handle(content: string): boolean { return content.includes('(execute "llm"'); }
    async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
        const query = bindings['query'] || content;
        const response = this.canned_responses[query] || "No response found.";
        const atom_content = response;
        const atom: SemanticAtom = { id: uuidv4(), content: atom_content, embedding: [0.8, 0.8, 0.8] };
        world_model.add_atom(atom);
        return [{
            id: uuidv4(),
            atom_id: atom.id,
            type: TaskType.BELIEF,
            truth: { frequency: 0.9, confidence: 0.9 },
            attention: { priority: 0.8, durability: 0.7 },
            stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: 'llm_handler' },
        }];
    }
}

// Schema to create the final alert
class SafetyConclusionSchema implements ICognitiveSchema {
    public readonly id: UUID = uuidv4();
    get_trigger_pattern() { return ["(is_toxic $substance $animal)", "(eats $animal $substance)"]; }
    apply(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, world_model: WorldModel, bindings: Record<string, string>): Task[] {
        const { $substance, $animal } = bindings;
        if (!$substance || !$animal) return [];
        const alert_content = `(send_alert user "Warning: ${$animal} ate toxic substance ${$substance}!")`;
        const atom: SemanticAtom = { id: uuidv4(), content: alert_content, embedding: [0.9, 0.9, 0.9] };
        world_model.add_atom(atom);
        return [{
            id: uuidv4(),
            atom_id: atom.id,
            type: TaskType.GOAL,
            attention: { priority: 0.95, durability: 0.9 },
            stamp: { timestamp: Date.now() / 1000, parent_ids: [task_a.id, task_b.id], schema_id: this.id },
        }];
    }
    apply_with_bindings(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, scope_bindings: Record<string, string>, world_model: WorldModel, bindings: Record<string, string>): Task[] {
        return this.apply(task_a, task_b, truth_policy, world_model, bindings);
    }
}

describe('Cognitive Engine - End-to-End Test from core.md', () => {
    let engine: CognitiveEngine;
    let world_model: WorldModel;
    let agenda: Agenda;

    it('should run the complete worked example from core.md step-by-step', async () => {
        // Setup all components within the test to ensure a clean slate.
        const attention_policy = new DefaultAttentionPolicy();
        const truth_policy = new DefaultTruthPolicy();
        world_model = new WorldModel(new DefaultResonanceStrategy(), truth_policy);
        agenda = new Agenda();
        const pattern_matcher = new InMemoryPatternMatcher();
        const schema_registry = new SchemaRegistry(pattern_matcher);

        schema_registry.register(new DeductionSchema());
        schema_registry.register(new SafetyConclusionSchema());

        const scope_atom: SemanticAtom = { id: "a3", content: '{(%sub=chocolate, %anim=cat), (GOAL (execute "llm" query:"is %sub toxic to %anim?"))}', embedding: [0.7, 0.8, 0.9] };
        world_model.add_atom(scope_atom);

        const safety_analysis_schema: ICognitiveSchema = {
            id: 'safety_schema',
            get_trigger_pattern: () => ['(is_safe_for $animal $substance)', '(eats $animal $substance)'],
            apply: (task_a, task_b, truth_policy, world_model, bindings) => {
                return [{ id: 't3', atom_id: 'a3', type: TaskType.GOAL, attention: { priority: 0.85, durability: 0.8 }, stamp: { timestamp: Date.now() / 1000, parent_ids: [task_a.id, task_b.id], schema_id: 'safety_schema' }}];
            },
            apply_with_bindings: (task_a, task_b, truth_policy, scope_bindings, world_model, bindings) => []
        };
        schema_registry.register(safety_analysis_schema);

        const mock_llm_handler = new MockLLMHandler({ "is chocolate toxic to cat?": "(is_toxic chocolate cat)" });
        const procedure_handlers = { "llm": mock_llm_handler };

        engine = new CognitiveEngine(world_model, agenda, attention_policy, truth_policy, procedure_handlers, schema_registry);

        const shared_embedding = [0.1, 0.2, 0.3];
        const atom1: SemanticAtom = { id: 'a1', content: '(eats cat chocolate)', embedding: shared_embedding };
        world_model.add_atom(atom1);
        const task1: Task = { id: 't1', atom_id: 'a1', type: TaskType.BELIEF, truth: { frequency: 0.8, confidence: 0.7 }, attention: { priority: 0.95, durability: 0.5 }, stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' }};
        await agenda.push(task1);

        const atom2: SemanticAtom = { id: 'a2', content: '(is_safe_for cat chocolate)', embedding: shared_embedding };
        world_model.add_atom(atom2);
        const task2: Task = { id: 't2', atom_id: 'a2', type: TaskType.GOAL, attention: { priority: 0.9, durability: 0.8 }, stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' }};
        await agenda.push(task2);

        // STAGE 1: Process the BELIEF, memorizing it.
        await engine.tick();
        expect(world_model.find_belief('a1')).toBeDefined();

        // STAGE 2: Process the GOAL, which should resonate with the now-memorized BELIEF, and fire the safety_analysis_schema to produce the scope_task.
        await engine.tick();
        let next_task = await agenda.peek();
        expect(next_task).toBeDefined();
        expect(next_task!.id).toBe('t3');

        // STAGE 3: Process the scope_task, executing the procedure and creating the LLM result belief.
        await engine.tick();
        next_task = await agenda.peek();
        expect(next_task).toBeDefined();
        let next_atom = world_model.get_atom(next_task!.atom_id);
        expect(next_atom.content).toBe('(is_toxic chocolate cat)');

        // STAGE 4: Process the LLM result belief, which should resonate with the original BELIEF, firing the SafetyConclusionSchema and creating the final alert goal.
        await engine.tick();
        next_task = await agenda.peek();
        expect(next_task).toBeDefined();
        next_atom = world_model.get_atom(next_task!.atom_id);
        expect(next_atom.content).toContain('send_alert');
    });
});
