import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldModel } from '../world-model';
import { TestResultProcedure } from '../procs/test_result';
import { MockResonanceStrategy, MockTruthPolicy } from './mocks';
import { InMemoryPatternMatcher } from '../implementations';
import { Task, SemanticAtom } from '../models';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { SchemaRegistry } from '../schema-registry';
import { EventBus } from '../../gui/EventBus';

describe('TestResultProcedure', () => {
    let worldModel: WorldModel;
    let procedure: TestResultProcedure;

    beforeEach(() => {
        const eventBus = new EventBus();
        const resonanceStrategy = new MockResonanceStrategy();
        const truthPolicy = new MockTruthPolicy();
        const patternMatcher = new InMemoryPatternMatcher();
        const schemaRegistry = new SchemaRegistry(patternMatcher);
        worldModel = new WorldModel(eventBus, resonanceStrategy, truthPolicy, schemaRegistry, patternMatcher);
        procedure = new TestResultProcedure();
    });

    it('should create a BELIEF task for a failing test', async () => {
        const fake_json_obj = {
            testResults: [
                {
                    assertionResults: [
                        {
                            status: "failed",
                            fullName: "should fail",
                            failureMessages: ["Error: test failed"]
                        }
                    ],
                    name: "/app/src/core/tests/fake.test.ts"
                }
            ]
        };
        const fake_json_str = JSON.stringify(fake_json_obj);
        const content = `(execute "test_result")`;
        const bindings = { 'json_content': fake_json_str };

        const tasks = await procedure.execute(content, bindings, worldModel);

        expect(tasks.length).toBe(1);
        const task = tasks[0];
        expect(task.type).toBe('BELIEF');
        const atom = worldModel.get_atom(task.atom_id);
        expect(atom.content).toBe('(test_failure (file "/app/src/core/tests/fake.test.ts") (test "should fail") (message "Error: test failed"))');
    });
});
