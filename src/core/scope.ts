import { SemanticAtom, Task } from './models';
import { UUID, ScopeVariable, ParsedScope } from './types';
import { WorldModel } from './world-model';
import { parseSExpression, sExpressionToString, SExpression } from './s-expression';
import { matchSExpressionPattern } from './implementations';

// Helper to parse a single variable definition, e.g., "%x" or "%y=default"
function parseSingleScopeVariable(varStr: string): ScopeVariable {
  const parts = varStr.trim().split('=');
  const name = parts[0].trim();
  if (!name.startsWith('$')) {
    throw new Error(`Invalid scope variable format: ${varStr}. Must start with '$'.`);
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

export function resolveScopeBindings(
    scope_task: Task,
    context_tasks: Task[],
    world_model: WorldModel
  ): Record<string, string> | undefined {
    const scope_atom = world_model.get_atom(scope_task.atom_id);
    if (!scope_atom.content.startsWith('{')) {
      return undefined; // Not a scope task
    }

    try {
      const parsed_scope = parseScopeExpression(scope_atom.content);
      const bindings: Record<string, string> = {};
      const required_vars = new Set<string>();

      // 1. Initialize bindings with default values
      for (const var_def of parsed_scope.variables) {
        if (var_def.required) {
          required_vars.add(var_def.name);
        }
        if (var_def.default !== undefined) {
          bindings[var_def.name] = String(var_def.default);
        }
      }

      // 2. Attempt to find bindings by matching patterns in the scope body against context tasks
      for (const body_pattern_str of parsed_scope.bodies) {
        if (!body_pattern_str.startsWith('(')) continue; // Skip non-S-expression bodies for now

        const body_pattern_sexpr = parseSExpression(body_pattern_str);

        for (const context_task of context_tasks) {
          const context_atom = world_model.get_atom(context_task.atom_id);
          const context_sexpr = parseSExpression(context_atom.content);

          // Try to match the pattern and extract bindings
          const temp_bindings: Record<string, string> = {};
          if (matchSExpressionPattern(body_pattern_sexpr, context_sexpr, temp_bindings)) {
            // If match is successful, merge the bindings
            for (const key in temp_bindings) {
              bindings[key] = temp_bindings[key];
            }
          }
        }
      }

      // 3. Check if all required variables have been bound
      for (const required_var of required_vars) {
        if (!bindings[required_var]) {
          console.warn(`Missing required binding for: ${required_var}`);
          return undefined; // A required binding is missing
        }
      }

      return Object.keys(bindings).length > 0 ? bindings : undefined;

    } catch (e) {
      console.error("Error resolving scope bindings:", e);
      return undefined;
    }
}

export function substituteInContent(content: string, bindings: Record<string, string>): string {
    let result = content;
    for (const varName in bindings) {
      // Ensure we replace the variable token, e.g., $var
      const regex = new RegExp(varName.replace(/\$/g, '\\$'), 'g');
      result = result.replace(regex, bindings[varName]);
    }
    return result;
}
