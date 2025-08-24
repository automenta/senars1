import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../../app';
import { Task } from '../models';
import { TaskType, UUID } from '../types';
import { ICognitiveSchema, ITruthPolicy, ProcedureHandler } from '../interfaces';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../utils';

class MockLLMHandler implements ProcedureHandler {
    async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
        let query = this.extract_param(content, 'query');
        if (!query) return [];

        for (const key in bindings) {
            const placeholder = new RegExp(key.replace('%', '\\%'), 'g');
            query = query.replace(placeholder, bindings[key]);
        }

        if (query === 'is chocolate toxic to cat?') {
            const atom = {
                id: uuidv4(),
                content: '(is_toxic chocolate cat)',
                embedding: [0.5, 0.5, 0.6], // Similar embedding
            };
            await world_model.add_atom(atom);
            return [{
                id: uuidv4(),
                atom_id: atom.id,
                type: TaskType.BELIEF,
                truth: { frequency: 0.95, confidence: 0.9 },
                attention: { priority: 0.85, durability: 0.8 },
                stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: 'llm_handler_mock' },
            }];
        }
        return [];
    }
    name(): string { return 'llm'; }
    can_handle(content: string): boolean { return content.includes('(execute "llm"'); }
    private extract_param(content: string, paramName: string): string | undefined {
        const regex = new RegExp(`${paramName}:"([^"]*)"`);
        const match = content.match(regex);
        return match ? match[1] : undefined;
    }
}

class SafetyAnalysisSchema implements ICognitiveSchema {
    id: UUID = 'safety_schema';
    get_trigger_pattern() {
        return ['(eats $animal $substance)', '(is_safe_for $animal $substance)'];
    }
    apply(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, world_model: WorldModel, bindings: Record<string, string>): Task[] {
        const scope_content = `{(%substance=${bindings['$substance']}, %animal=${bindings['$animal']}), (GOAL (execute "llm" query:"is %substance toxic to %animal?"))}`;
        const atom = { id: uuidv4(), content: scope_content, embedding: [0.1, 0.9, 0.2] };
        world_model.add_atom(atom);
        return [{
            id: uuidv4(),
            atom_id: atom.id,
            type: TaskType.GOAL,
            attention: { priority: 0.9, durability: 0.9 },
            stamp: { timestamp: Date.now() / 1000, parent_ids: [task_a.id, task_b.id], schema_id: this.id },
        }];
    }
    apply_with_bindings(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, scope_bindings: Record<string, string>, world_model: WorldModel, bindings: Record<string, string>): Task[] {
        return this.apply(task_a, task_b, truth_policy, world_model, bindings);
     }
}

class SafetyConclusionSchema implements ICognitiveSchema {
    id: UUID = 'safety_conclusion';
    get_trigger_pattern() {
        return ['(is_toxic $substance $animal)', '(eats $animal $substance)'];
    }
    apply(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, world_model: WorldModel, bindings: Record<string, string>): Task[] {
        const alert_content = `(send_alert user "Cat is in danger from chocolate!")`;
        const atom = { id: uuidv4(), content: alert_content, embedding: [0.9, 0.1, 0.1] };
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


describe('SeNARS End-to-End Test', () => {
  let app: App;

  beforeEach(async () => {
    app = await App.create(false);
    app.schema_registry.register(new SafetyAnalysisSchema());
    app.schema_registry.register(new SafetyConclusionSchema());
    // Manually replace the handler
    (app as any).procedure_handlers['llm'] = new MockLLMHandler();
  });

  it('should run the "Complete Worked Example" from core.md successfully', async () => {
    const mockGenerateEmbedding = vi.spyOn(utils, 'generate_embedding');
    mockGenerateEmbedding.mockReturnValue([0.5, 0.5, 0.5]);

    await app.add_new_thought('(eats cat chocolate)', TaskType.BELIEF);
    await app.add_new_thought('(is_safe_for cat chocolate)', TaskType.GOAL);

    for (let i = 0; i < 4; i++) {
        await app.tick();
    }

    const agenda_tasks = await app.agenda.get_all_tasks();
    const world_model_tasks = Object.values(app.world_model.tasks);
    const all_tasks = [...agenda_tasks, ...world_model_tasks];

    const get_content = (task: Task) => app.world_model.get_atom(task.atom_id).content;

    const toxic_belief = all_tasks.find(task => get_content(task) === '(is_toxic chocolate cat)');
    expect(toxic_belief).toBeDefined();
    expect(toxic_belief?.type).toBe(TaskType.BELIEF);

    const alert_goal = all_tasks.find(task => get_content(task).startsWith('(send_alert user'));
    expect(alert_goal).toBeDefined();
    expect(alert_goal?.type).toBe(TaskType.GOAL);
    expect(get_content(alert_goal!)).toBe('(send_alert user "Cat is in danger from chocolate!")');
  }, 10000);
});
