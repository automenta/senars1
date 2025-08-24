import { describe, it, expect, beforeEach } from 'vitest';
import { WorldModel } from '../../world-model';
import { TestAnalysisSchema } from '../../schemas/test_analysis';
import { MockResonanceStrategy, MockTruthPolicy } from '../world-model.test';
import { Task, SemanticAtom } from '../../models';
import { TaskType } from '../../types';
import { v4 as uuidv4 } from 'uuid';

describe('TestAnalysisSchema', () => {
    let worldModel: WorldModel;
    let schema: TestAnalysisSchema;
    let truthPolicy: MockTruthPolicy;

    beforeEach(() => {
        const resonanceStrategy = new MockResonanceStrategy();
        truthPolicy = new MockTruthPolicy();
        worldModel = new WorldModel(resonanceStrategy, truthPolicy);
        schema = new TestAnalysisSchema();
    });

    it('should create a GOAL task to fix a failing test', () => {
        const failure_atom: SemanticAtom = {
            id: uuidv4(),
            content: '(test_failure (file "/app/src/core/tests/fake.test.ts") (test "should fail") (message "Error: test failed"))',
            embedding: [],
        };
        worldModel.add_atom(failure_atom);

        const failure_task: Task = {
            id: uuidv4(),
            atom_id: failure_atom.id,
            type: TaskType.BELIEF,
            attention: { priority: 0.9, durability: 0.9 },
            stamp: {
                timestamp: Date.now() / 1000,
                parent_ids: [],
                schema_id: 'test-result-procedure-schema',
            },
        };

        const new_tasks = schema.apply(failure_task, failure_task, truthPolicy, worldModel);

        expect(new_tasks.length).toBe(1);
        const task = new_tasks[0];
        expect(task.type).toBe('GOAL');
        const atom = worldModel.get_atom(task.atom_id);
        expect(atom.content).toBe('(fix_test (file "/app/src/core/tests/fake.test.ts") (test "should fail"))');
    });
});
