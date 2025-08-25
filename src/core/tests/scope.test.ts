import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseScopeVariables, resolveScopeBindings, substituteInContent } from '../scope';
import { Task, SemanticAtom, AttentionValue, DerivationStamp } from '../models';
import { WorldModel } from '../world-model';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockResonanceStrategy, MockTruthPolicy } from './world-model.test';
import { InMemoryPatternMatcher } from '../implementations';
import { SchemaRegistry } from '../schema-registry';

describe('Scope Parsing and Resolution', () => {
  let worldModel: WorldModel;
  let mockTruthPolicy: MockTruthPolicy;
  let mockResonanceStrategy: MockResonanceStrategy;
  const mockApp = {
    emit: vi.fn(),
  };

  beforeEach(() => {
    mockResonanceStrategy = new MockResonanceStrategy();
    mockTruthPolicy = new MockTruthPolicy();
    const schemaRegistry = new SchemaRegistry(new InMemoryPatternMatcher());
    worldModel = new WorldModel(mockApp as any, mockResonanceStrategy, mockTruthPolicy, schemaRegistry, new InMemoryPatternMatcher());
    mockApp.emit.mockClear();
  });

  describe('parseScopeVariables', () => {
    it('should parse simple variables', () => {
      const varSection = '(%x, %y)';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([
        { name: '%x', required: true, default: undefined },
        { name: '%y', required: true, default: undefined },
      ]);
    });

    it('should parse variables with default values', () => {
      const varSection = '(%substance, %animal=cat)';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([
        { name: '%substance', required: true, default: undefined },
        { name: '%animal', required: false, default: 'cat' },
      ]);
    });

    it('should parse variables with quoted string defaults', () => {
      const varSection = '(%message="Hello World")';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([
        { name: '%message', required: false, default: '"Hello World"' },
      ]);
    });

    it('should handle empty variable section', () => {
      const varSection = '()';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([]);
    });

    it('should throw an error for invalid variable prefix', () => {
        const varSection = '(x, %y)';
        expect(() => parseScopeVariables(varSection)).toThrow("Invalid scope variable format: x. Must start with '%'.");
      });
  });


  describe('resolveScopeBindings', () => {
    it('should resolve bindings from default values', async () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{(%x=defaultX, %y=defaultY), (action %x %y)}',
        embedding: [],
      };
      await worldModel.add_atom(scopeAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = await resolveScopeBindings(taskA, [], worldModel);
      expect(bindings).toEqual({ '%x': 'defaultX', '%y': 'defaultY' });
    });

    it('should return undefined if required variables are missing', async () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{(%requiredVar), (action %requiredVar)}',
        embedding: [],
      };
      await worldModel.add_atom(scopeAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = await resolveScopeBindings(taskA, [], worldModel);
      expect(bindings).toBeUndefined();
    });

    it('should resolve bindings from context tasks', async () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{(%item, %color=red), (paint %item %color)}',
        embedding: [],
      };
      const contextAtom: SemanticAtom = { id: uuidv4(), content: '(paint car blue)', embedding: [] };
      await worldModel.add_atom(scopeAtom);
      await worldModel.add_atom(contextAtom);

      const scopeTask: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };
      const contextTask: Task = {
        id: uuidv4(), atom_id: contextAtom.id, type: TaskType.BELIEF,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = await resolveScopeBindings(scopeTask, [contextTask], worldModel);
      expect(bindings).toEqual({ '%item': 'car', '%color': 'blue' });
    });

    it('should resolve bindings from a nested sub-expression in a context task', async () => {
        const scopeAtom: SemanticAtom = {
          id: uuidv4(),
          content: '{(%substance, %animal), (is_toxic %substance %animal)}',
          embedding: [],
        };
        const contextAtom: SemanticAtom = {
            id: uuidv4(),
            content: '(implies (eats cat chocolate) (is_toxic chocolate cat))',
            embedding: []
        };
        await worldModel.add_atom(scopeAtom);
        await worldModel.add_atom(contextAtom);

        const scopeTask: Task = {
          id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
          attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };
        const contextTask: Task = {
            id: uuidv4(), atom_id: contextAtom.id, type: TaskType.BELIEF,
            attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
        };

        const bindings = await resolveScopeBindings(scopeTask, [contextTask], worldModel);
        expect(bindings).toEqual({ '%substance': 'chocolate', '%animal': 'cat' });
      });

    it('should bind a variable only once and not overwrite it', async () => {
        const scopeAtom: SemanticAtom = {
          id: uuidv4(),
          content: '{(%x), (isa %x animal)}',
          embedding: [],
        };
        const contextAtom1: SemanticAtom = { id: uuidv4(), content: '(isa cat animal)', embedding: [] };
        const contextAtom2: SemanticAtom = { id: uuidv4(), content: '(isa dog animal)', embedding: [] };
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

        // The order of context tasks might matter depending on the implementation, so we pass them in a fixed order.
        const bindings = await resolveScopeBindings(scopeTask, [contextTask1, contextTask2], worldModel);
        // The first match should bind %x to "cat" and the logic should not overwrite it with "dog".
        expect(bindings).toEqual({ '%x': 'cat' });
      });
  });

  describe('substituteInContent', () => {
    it('should substitute variables in content', () => {
      const content = '(is_toxic %substance %animal)';
      const bindings = { '%substance': 'chocolate', '%animal': 'cat' };
      const result = substituteInContent(content, bindings);
      expect(result).toBe('(is_toxic chocolate cat)');
    });

    it('should handle multiple occurrences of the same variable', () => {
      const content = '(related %x %x)';
      const bindings = { '%x': 'test' };
      const result = substituteInContent(content, bindings);
      expect(result).toBe('(related test test)');
    });

    it('should handle no-op substitutions', () => {
      const content = '(no variables)';
      const bindings = { '%a': 'b' };
      const result = substituteInContent(content, bindings);
      expect(result).toBe(content);
    });
  });
});