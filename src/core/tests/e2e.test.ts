import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../../app';
import { GuiManager } from '../../gui/gui-manager';
import { Task } from '../models';
import { TaskType, UUID } from '../types';
import { ICognitiveSchema, ITruthPolicy, ProcedureHandler } from '../interfaces';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../utils';
import { SafetyConclusionSchema } from '../schemas/safety_conclusion';

// Mock LLM Handler to simulate LLM calls without actual API requests
class MockLLMHandler implements ProcedureHandler {
    async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
        let query = this.extract_param(content, 'query');
        if (!query) return [];

        for (const key in bindings) {
            const placeholder = new RegExp(key.replace('%', '\\%'), 'g');
            query = query.replace(placeholder, bindings[key]);
        }

        if (query === 'is_toxic chocolate cat?') {
            const atom = {
                id: uuidv4(),
                content: '(is_toxic chocolate cat)',
                embedding: [0.5, 0.5, 0.6],
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

describe('SeNARS End-to-End Test', () => {
  let app: App;
  let guiManager: GuiManager;

  beforeEach(async () => {
    // Create a new app instance without seed data for a clean test environment
    app = await App.create(false);
    guiManager = new GuiManager(app);

    // The real SafetyAnalysisSchema and QuestionAnsweringSchema are registered by default in App.
    // We only need to register the final schema for creating the alert and mock the LLM handler.
    app.register_schema(new SafetyConclusionSchema());
    app.register_procedure_handler(new MockLLMHandler());
  });

  it('should run the "Complete Worked Example" from core.md successfully', async () => {
    const mockGenerateEmbedding = vi.spyOn(utils, 'generate_embedding');
    mockGenerateEmbedding.mockReturnValue([0.5, 0.5, 0.5]);

    await guiManager.add_new_thought('(eats cat chocolate)', TaskType.BELIEF);
    await guiManager.add_new_thought('(is_safe_for cat chocolate)', TaskType.GOAL);

    // More ticks are needed for the multi-step reasoning process:
    // 1. (eats) + (is_safe_for) -> SafetyAnalysisSchema -> (is_toxic)? [QUESTION]
    // 2. (is_toxic)? -> QuestionAnsweringSchema -> (execute llm) [PROCEDURE]
    // 3. (execute llm) -> MockLLMHandler -> (is_toxic) [BELIEF]
    // 4. (is_toxic) + (eats) -> SafetyConclusionSchema -> (send_alert) [GOAL]
    // 5. One extra tick for safety.
    for (let i = 0; i < 5; i++) {
        await app.tick();
    }

    const final_agenda_tasks = await app.agenda.get_all_tasks();
    const final_world_model_tasks = Object.values(app.world_model.tasks);
    const all_tasks = [...final_agenda_tasks, ...final_world_model_tasks];

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
