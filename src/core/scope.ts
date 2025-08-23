import { SemanticAtom, Task } from './models';
import { UUID, ScopeVariable, ParsedScope } from './types';
import { WorldModel } from './world-model';
import { parseSExpression, sExpressionToString, SExpression } from './s-expression';

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
  // This split needs to be careful not to split inside nested S-expressions or string literals
  // For now, a simple split by comma, assuming top-level commas separate variables and bodies
  const parts = innerContent.split(/,(?![^()]*")/g).map(p => p.trim()); // Split by comma not inside parentheses

  if (parts.length < 2) {
    throw new Error("Invalid scope expression: must contain variables and at least one body.");
  }

  const varSection = parts[0];
  const variables = parseScopeVariables(varSection);
  const bodies = parts.slice(1);

  return { variables, bodies };
}

// New helper to recursively extract variables from an SExpression object
function extractVarsFromSExpression(sExpr: SExpression | string, collectedVars: Set<string>): void {
  if (typeof sExpr === 'string') {
    const varRegex = /%[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match;
    while ((match = varRegex.exec(sExpr)) !== null) {
      collectedVars.add(match[0]);
    }
  } else {
    extractVarsFromSExpression(sExpr.head, collectedVars);
    sExpr.args.forEach(arg => extractVarsFromSExpression(arg, collectedVars));
  }
}

export function extractVarsFromContent(content: string): string[] {
  const collectedVars = new Set<string>();
  try {
    const parsedSExpr = parseSExpression(content);
    extractVarsFromSExpression(parsedSExpr, collectedVars);
  } catch (e) {
    // If it's not a valid S-Expression, fall back to simple regex on the string
    const varRegex = /%[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match;
    while ((match = varRegex.exec(content)) !== null) {
      collectedVars.add(match[0]);
    }
  }
  return Array.from(collectedVars);
}

// Helper to recursively find the value of a variable within an S-Expression
function findVariableValueInSExpression(
  sExpr: SExpression | string,
  var_name: string
): string | undefined {
  if (typeof sExpr === 'string') {
    return undefined; // Cannot find value in a simple string unless it IS the variable
  }

  // Check head and arguments
  for (let i = 0; i < sExpr.args.length; i++) {
    const arg = sExpr.args[i];
    if (typeof arg === 'string' && arg === var_name) {
      // If the variable name is found, the next argument might be its value
      if (i + 1 < sExpr.args.length) {
        return sExpressionToString(sExpr.args[i + 1]);
      }
    } else if (typeof arg !== 'string') {
      const nestedValue = findVariableValueInSExpression(arg, var_name);
      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }
  return undefined;
}

export function findBindingValue(
  var_name: string,
  task_a: Task,
  task_b: Task,
  world_model: WorldModel
): string | undefined {
  const atomA = world_model.get_atom(task_a.atom_id);
  const atomB = world_model.get_atom(task_b.atom_id);

  // Try to find the variable's value in atomA's content
  try {
    const parsedAtomA = parseSExpression(atomA.content);
    const valueA = findVariableValueInSExpression(parsedAtomA, var_name);
    if (valueA !== undefined) {
      return valueA;
    }
  } catch (e) {
    console.warn("Error parsing atomA content for binding value extraction:", e);
  }

  // Try to find the variable's value in atomB's content
  try {
    const parsedAtomB = parseSExpression(atomB.content);
    const valueB = findVariableValueInSExpression(parsedAtomB, var_name);
    if (valueB !== undefined) {
      return valueB;
    }
  } catch (e) {
    console.warn("Error parsing atomB content for binding value extraction:", e);
  }

  return undefined;
}

export function resolveScopeBindings(
  task_a: Task,
  task_b: Task,
  world_model: WorldModel
): Record<string, string> | undefined {
  const atoms = [
    world_model.get_atom(task_a.atom_id),
    world_model.get_atom(task_b.atom_id),
  ];

  const scope_atoms = atoms.filter((a) => a.content.startsWith('{'));
  if (scope_atoms.length === 0) {
    return undefined;
  }

  const bindings: Record<string, string> = {};
  const required_vars = new Set<string>();

  for (const atom of scope_atoms) {
    try {
      const parsedScope = parseScopeExpression(atom.content);
      for (const varDef of parsedScope.variables) {
        if (varDef.required) {
          required_vars.add(varDef.name);
        }
        if (varDef.default !== undefined) {
          bindings[varDef.name] = String(varDef.default);
        }
      }

      const content_vars = extractVarsFromContent(atom.content);
      for (const var_name of content_vars) {
        if (!(var_name in bindings)) {
          const value = findBindingValue(var_name, task_a, task_b, world_model);
          if (value !== undefined) {
            bindings[var_name] = value;
          } else if (required_vars.has(var_name)) {
            return undefined; // Missing required binding
          }
        }
      }
    } catch (e) {
      console.error("Error parsing scope expression:", e);
      continue;
    }
  }

  return Object.keys(bindings).length > 0 ? bindings : undefined;
}

export function substituteInContent(content: string, bindings: Record<string, string>): string {
  let result = content;
  for (const varName in bindings) {
    result = result.replace(new RegExp(varName.replace(/%/g, '\\%'), 'g'), bindings[varName]);
  }
  return result;
}
