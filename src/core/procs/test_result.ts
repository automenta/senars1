import { ProcedureHandler } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';
import { TaskType } from '../types';

import { extract_param } from '../procedure';

interface TestResult {
    testResults: {
        assertionResults: {
            status: string;
            fullName: string;
            failureMessages: string[];
        }[];
        name: string;
    }[];
}

export class TestResultProcedure implements ProcedureHandler {
    name(): string {
        return "test_result";
    }

    can_handle(content: string): boolean {
        return content.includes('(execute "test_result"');
    }

    execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Task[] {
        const json_content = extract_param(content, 'json_content');
        if (!json_content) {
            console.error("TestResultProcedure: json_content not provided.");
            return [];
        }

        try {
            const test_data: TestResult = JSON.parse(json_content);
            const new_tasks: Task[] = [];

            for (const suite of test_data.testResults) {
                for (const test of suite.assertionResults) {
                    if (test.status === 'failed') {
                        const failure_atom: SemanticAtom = {
                            id: uuidv4(),
                            content: `(test_failure (file "${suite.name}") (test "${test.fullName}") (message "${test.failureMessages.join(' ')}"))`,
                            embedding: [],
                        };
                        world_model.add_atom(failure_atom);

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
                        new_tasks.push(failure_task);
                    }
                }
            }
            return new_tasks;
        } catch (e) {
            console.error("Error parsing test result JSON:", e);
            return [];
        }
    }
}
