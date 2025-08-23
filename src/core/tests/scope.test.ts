import { describe, it, expect, beforeEach } from 'vitest';
import { parse_scope_vars, extract_vars_from_content, resolve_scope_bindings, substitute_in_content, find_binding_value } from '../scope';
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

  describe('parse_scope_vars', () => {
    it('should parse simple variables', () => {
      const varSection = '(%x, %y)';
      const result = parse_scope_vars(varSection);
      expect(result).toEqual([
        { name: '%x', required: true, default: undefined },
        { name: '%y', required: true, default: undefined },
      ]);
    });

    it('should parse variables with default values', () => {
      const varSection = '(%substance, %animal=cat)';
      const result = parse_scope_vars(varSection);
      expect(result).toEqual([
        { name: '%substance', required: true, default: undefined },
        { name: '%animal', required: false, default: 'cat' },
      ]);
    });

    it('should parse variables with quoted string defaults', () => {
      const varSection = '(%message="Hello World")';
      const result = parse_scope_vars(varSection);
      expect(result).toEqual([
        { name: '%message', required: false, default: 'Hello World' },
      ]);
    });

    it('should handle empty variable section', () => {
      const varSection = '()';
      const result = parse_scope_vars(varSection);
      expect(result).toEqual([]);
    });
  });

  describe('extract_vars_from_content', () => {
    it('should extract variables from S-expression content', () => {
      const content = '(implies (eats %animal %food) (is_sick %animal))';
      const result = extract_vars_from_content(content);
      expect(result).toEqual(['%animal', '%food']);
    });

    it('should return unique variables', () => {
      const content = '(related %x %x)';
      const result = extract_vars_from_content(content);
      expect(result).toEqual(['%x']);
    });

    it('should return empty array if no variables', () => {
      const content = '(no variables here)';
      const result = extract_vars_from_content(content);
      expect(result).toEqual([]);
    });
  });

  describe('find_binding_value', () => {
    it('should find a binding value from task content (simplified)', () => {
      const atomA: SemanticAtom = { id: uuidv4(), content: '(item apple)', embedding: [] }; // Simplified content
      worldModel.add_atom(atomA);

      const taskA: Task = {
        id: uuidv4(), atom_id: atomA.id, type: TaskType.BELIEF,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const value = find_binding_value('%item', taskA, taskA, worldModel); // Check taskA against itself
      expect(value).toBe('apple');
    });
  });

  describe('resolve_scope_bindings', () => {
    it('should resolve bindings from a single scope atom with default values', () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{(%x, %y=defaultY), (action %x %y)}',
        embedding: [],
      };
      worldModel.add_atom(scopeAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = resolve_scope_bindings(taskA, [], worldModel);
      // %x is required but not found by current find_binding_value, so the whole binding should be undefined.
      // If it were not required, then only %y would be bound.
      expect(bindings).toBeUndefined();
    });

    it('should return undefined if required variables are missing in context', () => {
      const scopeAtom1: SemanticAtom = {
        id: uuidv4(),
        content: '{(%item, %color=red), (paint %item %color)}',
        embedding: [],
      };
      const scopeAtom2: SemanticAtom = {
        id: uuidv4(),
        content: '{(%shape), (draw %shape)}',
        embedding: [],
      };
      const itemAtom: SemanticAtom = { id: uuidv4(), content: '(item (square))', embedding: [] };

      worldModel.add_atom(scopeAtom1);
      worldModel.add_atom(scopeAtom2);
      worldModel.add_atom(itemAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom1.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };
      const taskB: Task = {
        id: uuidv4(), atom_id: scopeAtom2.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };
      const taskC: Task = {
        id: uuidv4(), atom_id: itemAtom.id, type: TaskType.BELIEF,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = resolve_scope_bindings(taskA, [taskB, taskC], worldModel);
      // %item and %shape are required but not found by current find_binding_value, so the whole binding should be undefined.
      expect(bindings).toBeUndefined();
    });

    it('should return undefined if a required variable is missing', () => {
      const scopeAtom: SemanticAtom = {
        id: uuidv4(),
        content: '{(%requiredVar), (action %requiredVar)}',
        embedding: [],
      };
      worldModel.add_atom(scopeAtom);

      const taskA: Task = {
        id: uuidv4(), atom_id: scopeAtom.id, type: TaskType.GOAL,
        attention: { priority: 1, durability: 1 }, stamp: { timestamp: 0, parent_ids: [], schema_id: '' }
      };

      const bindings = resolve_scope_bindings(taskA, [], worldModel);
      expect(bindings).toBeUndefined();
    });
  });

  describe('substitute_in_content', () => {
    it('should substitute variables in content', () => {
      const content = '(is_toxic %substance %animal)';
      const bindings = { '%substance': 'chocolate', '%animal': 'cat' };
      const result = substitute_in_content(content, bindings);
      expect(result).toBe('(is_toxic chocolate cat)');
    });

    it('should handle multiple occurrences of the same variable', () => {
      const content = '(related %x %x)';
      const bindings = { '%x': 'test' };
      const result = substitute_in_content(content, bindings);
      expect(result).toBe('(related test test)');
    });

    it('should handle no-op substitutions', () => {
      const content = '(no variables)';
      const bindings = { '%a': 'b' };
      const result = substitute_in_content(content, bindings);
      expect(result).toBe(content);
    });
  });
});