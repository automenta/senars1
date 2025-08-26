import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldModel } from '../world-model';
import { execute_procedure, is_procedure_task, extract_handler_name } from '../procedure';
import { ProcedureHandler } from '../interfaces';
import { SemanticAtom, Task } from '../models';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockResonanceStrategy, MockTruthPolicy } from './mocks';
import { InMemoryPatternMatcher } from '../implementations';
import { SchemaRegistry } from '../schema-registry';
import { EventBus } from '../../gui/EventBus';

class MockSuccessHandler implements ProcedureHandler {
  name = () => 'success';
  can_handle = (content: string) => content.includes('success');
  async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
    const successAtom: SemanticAtom = { id: uuidv4(), content: '(result success)', embedding: [] };
    await world_model.add_atom(successAtom);
    return [{
      id: uuidv4(),
      atom_id: successAtom.id,
      type: TaskType.BELIEF,
      attention: { priority: 1, durability: 1 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    }];
  }
}

class MockFailureHandler implements ProcedureHandler {
  name = () => 'failure';
  can_handle = (content: string) => content.includes('failure');
  async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
    throw new Error('Handler failed');
  }
}

class MockTimeoutHandler implements ProcedureHandler {
    name = () => 'timeout';
    can_handle = (content: string) => content.includes('timeout');
    async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
      return new Promise(resolve => setTimeout(() => resolve([]), 100)); // Takes 100ms
    }
}

describe('Procedure Framework', () => {
  let worldModel: WorldModel;
  let handlers: Record<string, ProcedureHandler>;

  beforeEach(() => {
    const resonanceStrategy = new MockResonanceStrategy();
    const truthPolicy = new MockTruthPolicy();
    const patternMatcher = new InMemoryPatternMatcher();
    const schemaRegistry = new SchemaRegistry(patternMatcher);
    const eventBus = new EventBus();
    worldModel = new WorldModel(eventBus, resonanceStrategy, truthPolicy, schemaRegistry, patternMatcher);
    handlers = {
      'success': new MockSuccessHandler(),
      'failure': new MockFailureHandler(),
      'timeout': new MockTimeoutHandler(),
    };
  });

  const createTask = async (content: string, type: TaskType = TaskType.GOAL): Promise<Task> => {
    const atom: SemanticAtom = { id: uuidv4(), content, embedding: [] };
    await worldModel.add_atom(atom);
    return {
      id: uuidv4(),
      atom_id: atom.id,
      type,
      attention: { priority: 1, durability: 1 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };
  };

  describe('is_procedure_task', () => {
    it('should identify a simple procedure task', async () => {
      const task = await createTask('(execute "success")', TaskType.PROCEDURE);
      expect(is_procedure_task(task, worldModel)).toBe(true);
    });

    it('should identify a nested procedure task', async () => {
      const task = await createTask('(GOAL (execute "success"))');
      expect(is_procedure_task(task, worldModel)).toBe(true);
    });

    it('should return false for non-procedure tasks', async () => {
      const task = await createTask('(do_something else)');
      expect(is_procedure_task(task, worldModel)).toBe(false);
    });
  });

  describe('extract_handler_name', () => {
    it('should extract handler from simple procedure', () => {
        const content = '(execute "success" query:"test")';
        expect(extract_handler_name(content)).toBe('success');
    });

    it('should extract handler from nested procedure', () => {
        const content = '(GOAL (execute "failure" query:"test"))';
        expect(extract_handler_name(content)).toBe('failure');
    });
  });

  describe('execute_procedure', () => {
    it('should execute a successful handler and return result tasks', async () => {
      const task = await createTask('(execute "success")', TaskType.PROCEDURE);
      const results = await execute_procedure(task, worldModel, handlers, {});
      expect(results.length).toBe(1);
      const resultAtom = worldModel.get_atom(results[0].atom_id);
      expect(resultAtom.content).toBe('(result success)');
    });

    it('should create an error task when a handler fails', async () => {
      const task = await createTask('(execute "failure")', TaskType.PROCEDURE);
      const results = await execute_procedure(task, worldModel, handlers, {});
      expect(results.length).toBe(1);
      const errorAtom = worldModel.get_atom(results[0].atom_id);
      expect(errorAtom.content).toContain('(execution_error "failure"');
      expect(errorAtom.content).toContain('Handler failed');
    });

    it('should create an error task on execution timeout', async () => {
        const task = await createTask('(execute "timeout")', TaskType.PROCEDURE);
        const results = await execute_procedure(task, worldModel, handlers, {}, 10); // 10ms timeout
        expect(results.length).toBe(1);
        const errorAtom = worldModel.get_atom(results[0].atom_id);
        expect(errorAtom.content).toContain('(execution_error "timeout"');
        expect(errorAtom.content).toContain('timed out');
    });

    it('should handle missing handlers gracefully', async () => {
        const task = await createTask('(execute "unknown")', TaskType.PROCEDURE);
        const results = await execute_procedure(task, worldModel, handlers, undefined);
        expect(results.length).toBe(0);
    });
  });
});
