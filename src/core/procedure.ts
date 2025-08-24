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
  try {
    const s_expr = parseSExpression(atom.content);
    // A procedure is an S-expression with 'execute' as its head.
    // It can be nested, e.g. (GOAL (execute ...))
    const find_execute = (expr: SExpression | string): boolean => {
        if (typeof expr === 'string') {
            return false;
        }
        if (expr.head === 'execute') {
            return true;
        }
        return expr.args.some(find_execute);
    };
    return find_execute(s_expr);
  } catch (e) {
    // If parsing fails, it's not a well-formed procedure task.
    return false;
  }
}

export function extract_handler_name(content: string): string | undefined {
  try {
    const sExpr = parseSExpression(content);
    if (sExpr.head === 'execute' && sExpr.args.length > 0 && typeof sExpr.args[0] === 'string') {
      return sExpr.args[0].replace(/"/g, ''); // Strip quotes
    }
  } catch (e) {
    console.error("Error parsing S-Expression for handler name:", e);
  }
  return undefined;
}

export function extract_param(content: string, paramName: string): string | undefined {
  try {
    const sExpr = parseSExpression(content);

    const findExecute = (expr: SExpression): SExpression | undefined => {
        if (expr.head === 'execute') return expr;
        for(const arg of expr.args) {
            if(typeof arg !== 'string') {
                const found = findExecute(arg);
                if (found) return found;
            }
        }
        return undefined;
    };

    const executeExpr = findExecute(sExpr);

    if (executeExpr) {
      for (const arg of executeExpr.args) {
        if (typeof arg === 'string' && arg.startsWith(`${paramName}:`)) {
          let value = arg.substring(paramName.length + 1);
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          return value;
        }
      }
    }
  } catch (e) {
    console.error(`Error parsing S-Expression for parameter extraction of '${paramName}':`, e);
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