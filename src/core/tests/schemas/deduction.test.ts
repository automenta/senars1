import { describe, it, expect, beforeEach } from 'vitest';
import { DeductionSchema } from '../../../core/schemas/deduction';
import { WorldModel } from '../../../core/world-model';
import { Task, SemanticAtom, TruthValue } from '../../../core/models';
import { DefaultTruthPolicy } from '../../../core/implementations';
import { TaskType, UUID } from '../../../core/types';
import { IResonanceStrategy } from '../../../core/interfaces';

class MockResonance implements IResonanceStrategy {
    find_context(focus: Task, world_model: WorldModel, k: number): Task[] {
        return [];
    }
}

describe('DeductionSchema', () => {
    let schema: DeductionSchema;
    let world_model: WorldModel;
    let truth_policy: DefaultTruthPolicy;

    beforeEach(() => {
        schema = new DeductionSchema();
        truth_policy = new DefaultTruthPolicy();
        world_model = new WorldModel(new MockResonance(), truth_policy);
    });

    const create_task = (id: UUID, content: string, truth: TruthValue): Task => {
        const atom: SemanticAtom = { id: `atom-${id}`, content, embedding: [] };
        world_model.add_atom(atom);
        const task: Task = {
            id,
            atom_id: atom.id,
            type: TaskType.BELIEF,
            truth,
            attention: { priority: 0.8, durability: 0.8 },
            stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: '' },
        };
        world_model.add_task(task);
        return task;
    };

    it('should correctly derive a conclusion from a simple implication', () => {
        const implication = create_task('t1', '(implies (is_human socrates) (is_mortal socrates))', { frequency: 1.0, confidence: 0.9 });
        const premise = create_task('t2', '(is_human socrates)', { frequency: 1.0, confidence: 0.9 });

        const bindings = {
            '$P': '(is_human socrates)',
            '$Q': '(is_mortal socrates)',
        };

        const derived_tasks = schema.apply(implication, premise, truth_policy, world_model, bindings);

        expect(derived_tasks).toHaveLength(1);
        const derived_task = derived_tasks[0];
        const derived_atom = world_model.get_atom(derived_task.atom_id);

        expect(derived_atom.content).toBe('(is_mortal socrates)');
        expect(derived_task.type).toBe(TaskType.BELIEF);
        expect(derived_task.truth!.confidence).toBeCloseTo(0.81 * 0.9); // 0.9 * 0.9 * 0.9
    });

    it('should correctly derive a conclusion with variables', () => {
        const implication = create_task('t1', '(implies (is_human $x) (is_mortal $x))', { frequency: 1.0, confidence: 0.9 });
        const premise = create_task('t2', '(is_human socrates)', { frequency: 1.0, confidence: 0.9 });

        const bindings = {
            '$P': '(is_human $x)',
            '$Q': '(is_mortal $x)',
            '$x': 'socrates',
        };

        const derived_tasks = schema.apply(implication, premise, truth_policy, world_model, bindings);

        expect(derived_tasks).toHaveLength(1);
        const derived_task = derived_tasks[0];
        const derived_atom = world_model.get_atom(derived_task.atom_id);

        expect(derived_atom.content).toBe('(is_mortal socrates)');
    });

    it('should return no tasks if the premise does not match the implication', () => {
        const implication = create_task('t1', '(implies (is_human socrates) (is_mortal socrates))', { frequency: 1.0, confidence: 0.9 });
        const premise = create_task('t2', '(is_cat felix)', { frequency: 1.0, confidence: 0.9 });

        const bindings = {}; // No valid bindings would be found

        const derived_tasks = schema.apply(implication, premise, truth_policy, world_model, bindings);
        expect(derived_tasks).toHaveLength(0);
    });
});
