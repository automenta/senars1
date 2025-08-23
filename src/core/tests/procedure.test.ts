import { describe, it, expect, beforeEach } from 'vitest';
import { WorldModel } from '../world-model';
import { LLMHandler, execute_procedure, ProcedureHandler } from '../procedure';
import { SemanticAtom, Task } from '../models';
import { TaskType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockResonanceStrategy, MockTruthPolicy } from './world-model.test';

// Make the mock classes available in this file
export { MockResonanceStrategy, MockTruthPolicy };

describe('Procedure Execution', () => {
  let worldModel: WorldModel;
  let handlers: Map<string, ProcedureHandler>;

  beforeEach(() => {
    const resonanceStrategy = new MockResonanceStrategy();
    const truthPolicy = new MockTruthPolicy();
    worldModel = new WorldModel(resonanceStrategy, truthPolicy);
    handlers = new Map();
    handlers.set('llm', new LLMHandler());
  });

  it('should execute a procedure task', () => {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: '(execute "llm" query:"test query")',
      embedding: [],
    };
    worldModel.add_atom(atom);

    const task: Task = {
      id: uuidv4(),
      atom_id: atom.id,
      type: TaskType.PROCEDURE,
      attention: { priority: 1, durability: 1 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    const results = execute_procedure(task, worldModel, handlers, undefined);
    expect(results.length).toBe(1);
    const resultTask = results[0];
    expect(resultTask.type).toBe(TaskType.BELIEF);
    const resultAtom = worldModel.get_atom(resultTask.atom_id);
    expect(resultAtom.content).toContain('search_result');
  });

  it('should handle missing handlers', () => {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: '(execute "unknown" query:"test")',
      embedding: [],
    };
    worldModel.add_atom(atom);

    const task: Task = {
      id: uuidv4(),
      atom_id: atom.id,
      type: TaskType.PROCEDURE,
      attention: { priority: 1, durability: 1 },
      stamp: { timestamp: 0, parent_ids: [], schema_id: '' },
    };

    const results = execute_procedure(task, worldModel, handlers, undefined);
    expect(results.length).toBe(0);
  });
});
