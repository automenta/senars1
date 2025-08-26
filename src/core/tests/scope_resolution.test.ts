import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveScopeBindings } from '../scope';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockResonanceStrategy, MockTruthPolicy } from './mocks';
import { InMemoryPatternMatcher } from '../implementations';
import { SchemaRegistry } from '../schema-registry';
import { EventBus } from '../../gui/EventBus';

vi.mock('../utils.ts', () => ({
    generate_embedding: vi.fn().mockReturnValue([0.1, 0.2, 0.3]),
    generate_uuid: vi.fn(() => uuidv4()),
    is_schema_pattern: vi.fn().mockReturnValue(false),
}));

describe('Scope Resolution Logic', () => {
    let worldModel: WorldModel;
    let mockTruthPolicy: MockTruthPolicy;
    let mockResonanceStrategy: MockResonanceStrategy;
    let eventBus: EventBus;

    beforeEach(async () => {
        eventBus = new EventBus();
        mockResonanceStrategy = new MockResonanceStrategy();
        mockTruthPolicy = new MockTruthPolicy();
        const patternMatcher = new InMemoryPatternMatcher();
        const schemaRegistry = new SchemaRegistry(patternMatcher);
        worldModel = new WorldModel(eventBus, mockResonanceStrategy, mockTruthPolicy, schemaRegistry, patternMatcher);
    });

    it('should NOT resolve bindings from a nested sub-expression if the top-level structure does not match', async () => {
        const scopeAtom: SemanticAtom = {
            id: uuidv4(),
            content: '{(%creature), (is_a %creature cat)}',
            embedding: [],
        };
        const contextAtom: SemanticAtom = {
            id: uuidv4(),
            content: '(statement (is_a fluffy cat) is true)', // The pattern is nested inside
            embedding: []
        };
        await worldModel.add_atom(scopeAtom);
        await worldModel.add_atom(contextAtom);

        const scopeTask: Task = {
            id: uuidv4(),
            atom_id: scopeAtom.id,
            type: TaskType.GOAL,
            attention: { priority: 1, durability: 1 },
            stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };
        const contextTask: Task = {
            id: uuidv4(),
            atom_id: contextAtom.id,
            type: TaskType.BELIEF,
            attention: { priority: 1, durability: 1 },
            stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };

        // The current buggy implementation with recursive `findAndMatchPattern` will find a match
        // and bind %creature to 'fluffy'. A correct implementation should not match at all,
        // because the overall structure of the context task `(statement ...)` does not match the
        // pattern `(is_a ...)`.
        const bindings = await resolveScopeBindings(scopeTask, [contextTask], worldModel);

        // Since %creature is a required variable and no valid match should be found,
        // the resolution should fail and return undefined.
        expect(bindings).toBeUndefined();
    });

    it('should correctly resolve bindings from multiple context tasks', async () => {
        const scopeAtom: SemanticAtom = {
            id: uuidv4(),
            content: '{(%subject, %object), (is_a %subject animal), (is_a %object food)}',
            embedding: [],
        };
        const contextAtom1: SemanticAtom = { id: uuidv4(), content: '(is_a cat animal)', embedding: [] };
        const contextAtom2: SemanticAtom = { id: uuidv4(), content: '(is_a cheese food)', embedding: [] };

        await worldModel.add_atom(scopeAtom);
        await worldModel.add_atom(contextAtom1);
        await worldModel.add_atom(contextAtom2);

        const scopeTask: Task = {
            id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
            attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };
        const contextTask1: Task = {
            id: uuidv4(), atom_id: contextAtom1.id, type: TaskType.BELIEF,
            attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };
        const contextTask2: Task = {
            id: uuidv4(), atom_id: contextAtom2.id, type: TaskType.BELIEF,
            attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };

        const bindings = await resolveScopeBindings(scopeTask, [contextTask1, contextTask2], worldModel);
        expect(bindings).toEqual({ '%subject': 'cat', '%object': 'cheese' });
    });
});
