import { SemanticAtom, Task } from './models';
import { UUID, ScopeVariable, ParsedScope } from './types';
import { WorldModel } from './world-model';
import { parseSExpression, sExpressionToString, SExpression } from './s-expression';
import { matchSExpressionPattern } from './implementations';

// Helper to parse a single variable definition, e.g., "%x" or "%y=default"
function parseSingleScopeVariable(varStr: string): ScopeVariable {
  const parts = varStr.trim().split('=');
  const name = parts[0].trim();
  if (!name.startsWith('%')) {
    throw new Error(`Invalid scope variable format: ${varStr}. Must start with '%'.`);
  }
  const required = parts.length === 1;
  const defaultValue = parts.length > 1 ? parts[1].trim() : undefined;
  return { name, required, default: defaultValue };
}

export function parseScopeVariables(varSection: string): ScopeVariable[] {
  if (!varSection.startsWith('(') || !varSection.endsWith(')')) {
    throw new Error("Invalid scope variable section format: must be enclosed in parentheses.");
  }
  const varsContent = varSection.substring(1, varSection.length - 1).trim();
  if (!varsContent) {
    return [];
  }
  return varsContent.split(',').map(parseSingleScopeVariable);
}

export function parseScopeExpression(content: string): ParsedScope {
    if (!content.startsWith('{') || !content.endsWith('}')) {
      throw new Error("Invalid scope expression: must start with '{' and end with '}'.");
    }

    const innerContent = content.substring(1, content.length - 1).trim();
    const varBlockEnd = innerContent.indexOf(')');
    if (varBlockEnd === -1) {
        throw new Error("Invalid scope expression: missing variable block '()'.");
    }
    const varSection = innerContent.substring(0, varBlockEnd + 1);
    const variables = parseScopeVariables(varSection);

    // The rest is the body, separated by commas
    const bodyContent = innerContent.substring(varBlockEnd + 2).trim();
    const bodies = bodyContent.split(',').map(s => s.trim());

    return { variables, bodies };
}

export async function resolveScopeBindings(
    scope_task: Task,
    context_tasks: Task[],
    world_model: WorldModel
  ): Promise<Record<string, string> | undefined> {
    const scope_atom = world_model.get_atom(scope_task.atom_id);
    if (!scope_atom || !scope_atom.content.startsWith('{')) {
      return undefined; // Not a scope task
    }

    try {
      const parsed_scope = parseScopeExpression(scope_atom.content);
      const bindings: Record<string, string> = {};
      const required_vars = new Set<string>();

      // Collect required variables
      for (const var_def of parsed_scope.variables) {
        if (var_def.required) {
          required_vars.add(var_def.name);
        }
      }

      // 1. Iterate through body patterns and context tasks to find bindings from context
      for (const body_pattern_str of parsed_scope.bodies) {
        if (!body_pattern_str.startsWith('(')) continue;

        try {
          const body_pattern_sexpr = parseSExpression(body_pattern_str);

          for (const context_task of context_tasks) {
            const context_atom = world_model.get_atom(context_task.atom_id);
            if (!context_atom) continue;

            try {
              const context_sexpr = parseSExpression(context_atom.content);
              const temp_bindings: Record<string, string> = {};

              if (matchSExpressionPattern(body_pattern_sexpr, context_sexpr, temp_bindings)) {
                // Merge bindings, respecting already-bound variables from context
                for (const key in temp_bindings) {
                  if (!bindings.hasOwnProperty(key)) {
                    bindings[key] = temp_bindings[key];
                  }
                }
              }
            } catch (e) {
              // Ignore invalid S-Expressions in context
            }
          }
        } catch (e) {
          // Ignore invalid S-Expressions in patterns
        }
      }

      // 2. Apply default values for any variables that were not bound from context
      for (const var_def of parsed_scope.variables) {
        if (var_def.default !== undefined && !bindings.hasOwnProperty(var_def.name)) {
          bindings[var_def.name] = String(var_def.default);
        }
      }

      // 3. Check if all required variables have been bound
      for (const required_var of required_vars) {
        if (!bindings.hasOwnProperty(required_var)) {
          console.warn(`Missing required binding for scope variable: ${required_var}`);
          return undefined;
        }
      }

      return bindings;

    } catch (e) {
      console.error("Error resolving scope bindings:", e);
      return undefined;
    }
}

export function substituteInContent(content: string, bindings: Record<string, string>): string {
    let result = content;
    for (const varName in bindings) {
      // Ensure we replace the variable token, e.g., %var
      const regex = new RegExp(varName.replace(/%/g, '\\%'), 'g');
      result = result.replace(regex, bindings[varName]);
    }
    return result;
}
