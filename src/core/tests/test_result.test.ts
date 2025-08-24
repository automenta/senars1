import { describe, it, expect, beforeEach } from 'vitest';
import { WorldModel } from '../world-model';
import { TestResultProcedure } from '../procs/test_result';
import { MockResonanceStrategy, MockTruthPolicy } from './world-model.test';
import { Task, SemanticAtom } from '../models';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';

describe('TestResultProcedure', () => {
    let worldModel: WorldModel;
    let procedure: TestResultProcedure;

    beforeEach(() => {
        const resonanceStrategy = new MockResonanceStrategy();
        const truthPolicy = new MockTruthPolicy();
        worldModel = new WorldModel(resonanceStrategy, truthPolicy);
        procedure = new TestResultProcedure();
    });

    it('should create a BELIEF task for a failing test', () => {
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

        const tasks = procedure.execute(content, bindings, worldModel);

        expect(tasks.length).toBe(1);
        const task = tasks[0];
        expect(task.type).toBe('BELIEF');
        const atom = worldModel.get_atom(task.atom_id);
        expect(atom.content).toBe('(test_failure (file "/app/src/core/tests/fake.test.ts") (test "should fail") (message "Error: test failed"))');
    });
});
