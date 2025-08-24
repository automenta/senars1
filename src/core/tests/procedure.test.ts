import { describe, it, expect, beforeEach } from 'vitest';
import { WorldModel } from '../world-model';
import { execute_procedure } from '../procedure';
import { ProcedureHandler } from '../interfaces';
import { SemanticAtom, Task, TruthValue } from '../models';
import { TaskType, UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MockResonanceStrategy, MockTruthPolicy } from './world-model.test';

// Make the mock classes available in this file
export { MockResonanceStrategy, MockTruthPolicy };

// Mock LLMHandler for testing purposes
class MockLLMHandler implements ProcedureHandler {
  name(): string {
    return "llm";
  }

  can_handle(content: string): boolean {
    return content.includes('(execute "llm"');
  }

  execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Task[] {
    const newAtom: SemanticAtom = {
      id: uuidv4(),
      content: '(search_result "test query" "test result")',
      embedding: [],
    };
    world_model.add_atom(newAtom);

    const newTask: Task = {
      id: uuidv4(),
      atom_id: newAtom.id,
      type: TaskType.BELIEF,
      truth: { frequency: 0.9, confidence: 0.9 },
      attention: { priority: 0.8, durability: 0.8 },
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [],
        schema_id: 'mock-llm-handler-schema',
      },
    };
    return [newTask];
  }
}

describe('Procedure Execution', () => {
  let worldModel: WorldModel;
  let handlers: Record<string, ProcedureHandler>;

  beforeEach(() => {
    const resonanceStrategy = new MockResonanceStrategy();
    const truthPolicy = new MockTruthPolicy();
    worldModel = new WorldModel(resonanceStrategy, truthPolicy);
    handlers = {
      'llm': new MockLLMHandler(),
    };
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
