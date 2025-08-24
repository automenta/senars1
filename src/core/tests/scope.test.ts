import { describe, it, expect, beforeEach } from 'vitest';
import { parseScopeVariables, resolveScopeBindings, substituteInContent } from '../scope';
import { Task, SemanticAtom, AttentionValue, DerivationStamp } from '../models';
import { WorldModel } from '../world-model';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockResonanceStrategy, MockTruthPolicy } from './world-model.test';

describe('Scope Parsing and Resolution', () => {
  let worldModel: WorldModel;
  let mockTruthPolicy: MockTruthPolicy;
  let mockResonanceStrategy: MockResonanceStrategy;

  beforeEach(() => {
    mockResonanceStrategy = new MockResonanceStrategy();
    mockTruthPolicy = new MockTruthPolicy();
    worldModel = new WorldModel(mockResonanceStrategy, mockTruthPolicy);
  });

  describe('parseScopeVariables', () => {
    it('should parse simple variables', () => {
      const varSection = '($x, $y)';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([
        { name: '$x', required: true, default: undefined },
        { name: '$y', required: true, default: undefined },
      ]);
    });

    it('should parse variables with default values', () => {
      const varSection = '($substance, $animal=cat)';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([
        { name: '$substance', required: true, default: undefined },
        { name: '$animal', required: false, default: 'cat' },
      ]);
    });

    it('should parse variables with quoted string defaults', () => {
      const varSection = '($message="Hello World")';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([
        { name: '$message', required: false, default: '"Hello World"' },
      ]);
    });

    it('should handle empty variable section', () => {
      const varSection = '()';
      const result = parseScopeVariables(varSection);
      expect(result).toEqual([]);
    });
  });


  describe('resolveScopeBindings', () => {
    it('should resolve bindings from default values', () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{($x=defaultX, $y=defaultY), (action $x $y)}',
        embedding: [],
      };
      worldModel.add_atom(scopeAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = resolveScopeBindings(taskA, [], worldModel);
      expect(bindings).toEqual({ '$x': 'defaultX', '$y': 'defaultY' });
    });

    it('should return undefined if required variables are missing', () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{($requiredVar), (action $requiredVar)}',
        embedding: [],
      };
      worldModel.add_atom(scopeAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = resolveScopeBindings(taskA, [], worldModel);
      expect(bindings).toBeUndefined();
    });

    it('should resolve bindings from context tasks', () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{($item, $color=red), (paint $item $color)}',
        embedding: [],
      };
      const contextAtom: SemanticAtom = { id: uuidv4(), content: '(paint car blue)', embedding: [] };
      worldModel.add_atom(scopeAtom);
      worldModel.add_atom(contextAtom);

      const scopeTask: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };
      const contextTask: Task = {
        id: uuidv4(), atom_id: contextAtom.id, type: TaskType.BELIEF,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = resolveScopeBindings(scopeTask, [contextTask], worldModel);
      expect(bindings).toEqual({ '$item': 'car', '$color': 'blue' });
    });
  });

  describe('substituteInContent', () => {
    it('should substitute variables in content', () => {
      const content = '(is_toxic $substance $animal)';
      const bindings = { '$substance': 'chocolate', '$animal': 'cat' };
      const result = substituteInContent(content, bindings);
      expect(result).toBe('(is_toxic chocolate cat)');
    });

    it('should handle multiple occurrences of the same variable', () => {
      const content = '(related $x $x)';
      const bindings = { '$x': 'test' };
      const result = substituteInContent(content, bindings);
      expect(result).toBe('(related test test)');
    });

    it('should handle no-op substitutions', () => {
      const content = '(no variables)';
      const bindings = { '$a': 'b' };
      const result = substituteInContent(content, bindings);
      expect(result).toBe(content);
    });
  });
});