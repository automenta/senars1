import { Task, SemanticAtom, DerivationStamp, AttentionValue, TruthValue } from './models';
import { UUID, TaskType } from './types';
import { WorldModel } from './world-model';
import { ProcedureHandler } from './interfaces';
import { substituteInContent } from './scope';
import { parseSExpression, SExpression } from './s-expression';

// Helper to generate a UUID (placeholder)
function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
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
      return sExpr.args[0];
    }
  } catch (e) {
    console.error("Error parsing S-Expression for handler name:", e);
  }
  return undefined;
}

export function extract_param(content: string, paramName: string): string | undefined {
  try {
    const sExpr = parseSExpression(content);
    if (sExpr.head === 'execute') {
      for (let i = 1; i < sExpr.args.length; i++) {
        const arg = sExpr.args[i];
        if (typeof arg === 'string' && arg.startsWith(`${paramName}:`)) {
          return arg.substring(paramName.length + 1);
        }
      }
    }
  } catch (e) {
    console.error("Error parsing S-Expression for parameter extraction:", e);
  }
  return undefined;
}

export function execute_procedure(
  task: Task,
  world_model: WorldModel,
  handlers: Record<string, ProcedureHandler>,
  bindings: Record<string, string> | undefined
): Task[] {
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
    return handlers[handler_name].execute(content, bindings || {}, world_model);
  } catch (e: any) {
    console.error(`Error executing procedure ${handler_name}:`, e);
    const error_atom = {
      id: generate_uuid(),
      content: `(execution_error "${handler_name}" "${e.message || String(e)}")`,
      embedding: [], // Placeholder
    };
    world_model.add_atom(error_atom);

    return [
      {
        id: generate_uuid(),
        atom_id: error_atom.id,
        type: TaskType.BELIEF,
        truth: { frequency: 0.0, confidence: 1.0 },
        attention: { priority: 0.9, durability: 0.9 },
        stamp: {
          timestamp: Date.now() / 1000,
          parent_ids: [task.id],
          schema_id: generate_uuid("error_handler"),
        },
      },
    ];
  }
}