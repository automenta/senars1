import { v4 as uuidv4 } from 'uuid';
import { Task, SemanticAtom } from './models';
import { UUID, TaskType } from './types';
import { WorldModel } from './world-model';
import { ProcedureHandler } from './interfaces';
import { substituteInContent } from './scope';
import { parseSExpression, SExpression } from './s-expression';

function create_error_task(e: any, handler_name: string, parent_task_id: UUID, world_model: WorldModel): Task[] {
    console.error(`Error executing procedure ${handler_name}:`, e);
    const error_atom: SemanticAtom = {
      id: uuidv4(),
      content: `(execution_error "${handler_name}" "${e.message || String(e)}")`,
      embedding: [],
    };
    world_model.add_atom(error_atom);

    return [
      {
        id: uuidv4(),
        atom_id: error_atom.id,
        type: TaskType.BELIEF,
        truth: { frequency: 0.0, confidence: 1.0 },
        attention: { priority: 0.9, durability: 0.9 },
        stamp: {
          timestamp: Date.now() / 1000,
          parent_ids: [parent_task_id],
          schema_id: uuidv4(),
        },
      },
    ];
}

export function is_procedure_task(task: Task, world_model: WorldModel): boolean {
  const atom = world_model.get_atom(task.atom_id);
  // A procedure is identified by the presence of an '(execute ...)' call.
  // A simple string search is more robust than parsing, as the call can be
  // embedded in other syntax like scopes '{...}' which are not valid S-Expressions.
  return atom.content.includes('(execute ');
}

export function extract_handler_name(content: string): string | undefined {
    // Use a regex to find the handler name within an (execute ...) call,
    // which is more robust than parsing the whole string as an S-Expression.
    const match = content.match(/\(execute\s+"([^"]+)"/);
    if (match && match[1]) {
        return match[1];
    }
    return undefined;
}

export function extract_param(content: string, paramName: string): string | undefined {
    // This regex finds a parameter in the format `paramName:"value"` within the content string.
    // It's designed to work even if the content is not a perfect S-Expression (e.g., inside a scope).
    const regex = new RegExp(`${paramName}:"([^"]*)"`);
    const match = content.match(regex);
    if (match && match[1]) {
        return match[1];
    }
    return undefined;
}

export async function execute_procedure(
  task: Task,
  world_model: WorldModel,
  handlers: Record<string, ProcedureHandler>,
  bindings: Record<string, string> | undefined,
  timeout_ms: number = 5000
): Promise<Task[]> {
  const atom = world_model.get_atom(task.atom_id);
  let content = atom.content;

  if (bindings) {
    content = substituteInContent(content, bindings);
  }

  const handler_name = extract_handler_name(content);
  if (!handler_name || !handlers[handler_name]) {
    console.warn(`No handler found for procedure: ${handler_name}`);
    return [];
  }

  try {
    // Directly await the handler's execution, which might be async
    const execution_promise = handlers[handler_name].execute(content, bindings || {}, world_model);

    const timeout_promise = new Promise<Task[]>((_, reject) =>
      setTimeout(() => reject(new Error(`Execution timed out after ${timeout_ms}ms`)), timeout_ms)
    );

    return await Promise.race([execution_promise, timeout_promise]);
  } catch (e: any) {
    return create_error_task(e, handler_name, task.id, world_model);
  }
}