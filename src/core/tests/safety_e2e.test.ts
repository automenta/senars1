import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CognitiveEngine } from '../engine';
import { WorldModel } from '../world-model';
import { Agenda } from '../agenda';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, InMemoryPatternMatcher } from '../implementations';
import { SchemaRegistry } from '../schema-registry';
import { SafetyAnalysisSchema } from '../schemas/safety_analysis';
import { QuestionAnsweringSchema } from '../schemas/question_answering';
import { Task, SemanticAtom } from '../models';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../../gui/EventBus';
import { generate_embedding } from '../utils';
import { ProcedureHandler } from '../interfaces';

// Mock LLM Handler for testing purposes
class MockLLMHandler implements ProcedureHandler {
    name = () => 'llm';
    can_handle = (content: string) => content.includes('(execute "llm"');
    async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
        const resultAtom: SemanticAtom = {
            id: uuidv4(),
            content: '(llm_result (query "is toxic chocolate cat?") (answer "Yes, chocolate is toxic to cats."))',
            embedding: []
        };
        await world_model.add_atom(resultAtom);
        return [{
            id: uuidv4(),
            atom_id: resultAtom.id,
            type: TaskType.BELIEF,
            truth: { frequency: 0.9, confidence: 0.9 },
            attention: { priority: 1, durability: 1 },
            stamp: { timestamp: 0, parent_ids: [], schema_id: 'mock-llm-schema' },
        }];
    }
}

describe('Safety E2E Test', () => {
    let engine: CognitiveEngine;
    let world_model: WorldModel;
    let agenda: Agenda;
    let schema_registry: SchemaRegistry;
    let procedure_handlers: Record<string, ProcedureHandler>;

    beforeEach(() => {
        const eventBus = new EventBus();
        const attention_policy = new DefaultAttentionPolicy();
        const truth_policy = new DefaultTruthPolicy();
        const resonance_strategy = new DefaultResonanceStrategy();
        const pattern_matcher = new InMemoryPatternMatcher();

        schema_registry = new SchemaRegistry(pattern_matcher);
        world_model = new WorldModel(eventBus, resonance_strategy, truth_policy, schema_registry, pattern_matcher);
        agenda = new Agenda(eventBus);
        procedure_handlers = {
            'llm': new MockLLMHandler()
        };

        // Register schemas
        schema_registry.register(new SafetyAnalysisSchema());
        schema_registry.register(new QuestionAnsweringSchema());

        engine = new CognitiveEngine(
            world_model,
            agenda,
            attention_policy,
            truth_policy,
            procedure_handlers,
            schema_registry
        );
    });

    it('should run the full safety analysis workflow and produce a belief', async () => {
        // 1. Create initial belief and goal
        const atom_eats: SemanticAtom = { id: uuidv4(), content: '(eats cat chocolate)', embedding: [] };
        const atom_is_safe: SemanticAtom = { id: uuidv4(), content: '(is_safe_for cat chocolate)', embedding: [] };
        await world_model.add_atom(atom_eats);
        await world_model.add_atom(atom_is_safe);

        const belief_task: Task = { id: uuidv4(), atom_id: atom_eats.id, type: TaskType.BELIEF, truth: { frequency: 0.9, confidence: 0.9 }, attention: { priority: 0.8, durability: 0.8 }, stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' } };
        const goal_task: Task = { id: uuidv4(), atom_id: atom_is_safe.id, type: TaskType.GOAL, attention: { priority: 0.9, durability: 0.9 }, stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' } };

        // 2. Add tasks to agenda and world model
        await agenda.push(goal_task);
        await world_model.add_task(belief_task);

        // 3. Run the engine through multiple ticks to see the full flow

        // Tick 1: SafetyAnalysisSchema should create a QUESTION
        await engine.tick();
        let agenda_tasks = await agenda.get_all_tasks();
        const question_task = agenda_tasks.find(t => t.type === TaskType.QUESTION);
        expect(question_task).toBeDefined();
        if (question_task) {
            const question_atom = world_model.get_atom(question_task.atom_id);
            expect(question_atom.content).toBe('(is_toxic chocolate cat)');
        }

        // Tick 2: QuestionAnsweringSchema should create a GOAL to call the LLM
        await engine.tick();
        agenda_tasks = await agenda.get_all_tasks();
        const goal_proc_task = agenda_tasks.find(t => t.type === TaskType.GOAL && world_model.get_atom(t.atom_id).content.includes('execute "llm"'));
        expect(goal_proc_task).toBeDefined();

        // Tick 3: MockLLMHandler should execute and create a BELIEF
        await engine.tick();
        agenda_tasks = await agenda.get_all_tasks();
        const belief_result_task = agenda_tasks.find(t => t.type === TaskType.BELIEF);
        expect(belief_result_task).toBeDefined();
        if (belief_result_task) {
            const belief_atom = world_model.get_atom(belief_result_task.atom_id);
            expect(belief_atom.content).toContain('(answer "Yes, chocolate is toxic to cats.")');
        }

        // Tick 4: The final belief is added to the world model
        await engine.tick();
        const final_belief_in_wm = world_model.find_belief(belief_result_task!.atom_id);
        expect(final_belief_in_wm).toBeDefined();
    });
});
