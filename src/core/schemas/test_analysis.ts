import { ICognitiveSchema, ITruthPolicy } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';
import { TaskType, UUID } from '../types';

export class TestAnalysisSchema implements ICognitiveSchema {
    public readonly id: UUID = uuidv4();

    get_trigger_pattern(): string {
        return '(test_failure (file $file) (test $test) (message $message))';
    }

    apply(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, world_model: WorldModel): Task[] {
        // This schema is unary, it only needs one task to trigger.
        // We will assume that task_a is the test_failure belief.
        const bindings: Record<string, string> = {};
        const pattern = this.get_trigger_pattern();
        const atom = world_model.get_atom(task_a.atom_id);

        // A simple way to check for a match and extract bindings
        const match = atom.content.match(/\(test_failure \(file "([^"]+)"\) \(test "([^"]+)"\) \(message "([^"]+)"\)\)/);
        if (!match) {
            return [];
        }

        bindings['$file'] = match[1];
        bindings['$test'] = match[2];
        bindings['$message'] = match[3];

        const goal_atom: SemanticAtom = {
            id: uuidv4(),
            content: `(fix_test (file "${bindings['$file']}") (test "${bindings['$test']}"))`,
            embedding: [],
        };
        world_model.add_atom(goal_atom);

        const goal_task: Task = {
            id: uuidv4(),
            atom_id: goal_atom.id,
            type: TaskType.GOAL,
            attention: { priority: 0.95, durability: 0.95 },
            stamp: {
                timestamp: Date.now() / 1000,
                parent_ids: [task_a.id],
                schema_id: this.id,
            },
        };

        return [goal_task];
    }

    apply_with_bindings(task_a: Task, task_b: Task, truth_policy: ITruthPolicy, scope_bindings: Record<string, string>, world_model: WorldModel): Task[] {
        // This schema does not use scope bindings.
        return this.apply(task_a, task_b, truth_policy, world_model);
    }
}
