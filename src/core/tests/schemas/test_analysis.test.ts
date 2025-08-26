import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldModel } from '../../world-model';
import { TestAnalysisSchema } from '../../schemas/test_analysis';
import { MockResonanceStrategy, MockTruthPolicy } from '../mocks';
import { InMemoryPatternMatcher } from '../../implementations';
import { Task, SemanticAtom } from '../../models';
import { TaskType } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { SchemaRegistry } from '../../schema-registry';
import { EventBus } from '../../../gui/EventBus';

describe('TestAnalysisSchema', () => {
    let worldModel: WorldModel;
    let schema: TestAnalysisSchema;
    let truthPolicy: MockTruthPolicy;

    beforeEach(() => {
        const eventBus = new EventBus();
        const resonanceStrategy = new MockResonanceStrategy();
        truthPolicy = new MockTruthPolicy();
        const patternMatcher = new InMemoryPatternMatcher();
        const schemaRegistry = new SchemaRegistry(patternMatcher);
        worldModel = new WorldModel(eventBus, resonanceStrategy, truthPolicy, schemaRegistry, patternMatcher);
        schema = new TestAnalysisSchema();
    });

    it('should create a GOAL task to fix a failing test', async () => {
        const failure_atom: SemanticAtom = {
            id: uuidv4(),
            content: '(test_failure (file "/app/src/core/tests/fake.test.ts") (test "should fail") (message "Error: test failed"))',
            embedding: [],
        };
        await worldModel.add_atom(failure_atom);

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

        const new_tasks = await schema.apply(failure_task, undefined, truthPolicy, worldModel, {});

        expect(new_tasks.length).toBe(1);
        const task = new_tasks[0];
        expect(task.type).toBe('GOAL');
        const atom = worldModel.get_atom(task.atom_id);
        expect(atom.content).toBe('(fix_test (file "/app/src/core/tests/fake.test.ts") (test "should fail"))');
    });
});
