import { ICognitiveSchema, ITruthPolicy } from './interfaces';
import { Task, SemanticAtom, DerivationStamp, TruthValue } from './models';
import { UUID, TaskType } from './types';
import { parseSExpression, sExpressionToString, SExpression } from './s-expression';
import { substituteInContent } from './scope';
import { matchSExpressionPattern } from './implementations';
import { WorldModel } from './world-model'; // Import WorldModel

// Helper to generate a UUID (placeholder)
function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
}

export class DeductionSchema implements ICognitiveSchema {
  public readonly id: UUID = generate_uuid("deduction_schema");

  get_trigger_pattern(): string {
    // This schema will look for two tasks: one that is an implication, and one that is the premise of that implication.
    // It will then derive the conclusion.
    return "(implies $PREMISE $CONCLUSION)"; // This pattern will match the implication task
  }

  apply(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel // Now WorldModel is available
  ): Task[] {
    const derivedTasks: Task[] = [];

    const atomA = world_model.get_atom(task_a.atom_id);
    const atomB = world_model.get_atom(task_b.atom_id);

    try {
      const implicationPattern = parseSExpression(this.get_trigger_pattern());
      const parsedAtomA = parseSExpression(atomA.content);
      const parsedAtomB = parseSExpression(atomB.content);

      const bindings: Record<string, string> = {};

      // Try to match task_a as the implication and task_b as the fact
      if (matchSExpressionPattern(implicationPattern, parsedAtomA, bindings)) {
        const premiseSExprStr = bindings["$PREMISE"];
        const conclusionSExprStr = bindings["$CONCLUSION"];

        // Now, try to match task_b's content against the premise of the implication
        const factBindings: Record<string, string> = {};
        if (matchSExpressionPattern(parseSExpression(premiseSExprStr), parsedAtomB, factBindings)) {
          // We have matched the premise and extracted variables from the fact.
          // Now substitute these variables into the conclusion.
          let derivedContent = conclusionSExprStr;
          for (const varName in factBindings) {
            derivedContent = derivedContent.replace(new RegExp(varName.replace(/\$/g, '\\$'), 'g'), factBindings[varName]);
          }

          const derivedAtom: SemanticAtom = {
            id: generate_uuid(),
            content: derivedContent,
            embedding: [], // Placeholder
          };
          world_model.add_atom(derivedAtom); // Add the new atom to the world model

          const derivedTask: Task = {
            id: generate_uuid(),
            atom_id: derivedAtom.id,
            type: TaskType.BELIEF,
            truth: truth_policy.derivation(task_a, task_b, this.id),
            attention: { priority: 0.7, durability: 0.7 }, // Placeholder
            stamp: {
              timestamp: Date.now() / 1000,
              parent_ids: [task_a.id, task_b.id],
              schema_id: this.id,
            },
          };
          derivedTasks.push(derivedTask);
        }
      }
    } catch (e) {
      console.error("Error in DeductionSchema.apply:", e);
    }

    return derivedTasks;
  }

  apply_with_bindings(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel // Now WorldModel is available
  ): Task[] {
    // This method is called when scope bindings have already been resolved.
    // We can reuse the logic from `apply` but also incorporate `scope_bindings` if needed.
    // For deduction, the primary logic is still matching the implication and fact.
    // The scope_bindings might be used to pre-fill some variables in the implication or fact if they were part of a larger scope.

    const derivedTasks: Task[] = [];

    const atomA = world_model.get_atom(task_a.atom_id);
    const atomB = world_model.get_atom(task_b.atom_id);

    try {
      const implicationPattern = parseSExpression(this.get_trigger_pattern());
      let atomAContent = atomA.content;
      let atomBContent = atomB.content;

      // Apply scope bindings to the atom content if they contain variables relevant to the content
      atomAContent = substituteInContent(atomAContent, scope_bindings);
      atomBContent = substituteInContent(atomBContent, scope_bindings);

      const parsedAtomA = parseSExpression(atomAContent);
      const parsedAtomB = parseSExpression(atomBContent);

      const bindings: Record<string, string> = {};

      if (matchSExpressionPattern(implicationPattern, parsedAtomA, bindings)) {
        const premiseSExprStr = bindings["$PREMISE"];
        const conclusionSExprStr = bindings["$CONCLUSION"];

        const factBindings: Record<string, string> = {};
        if (matchSExpressionPattern(parseSExpression(premiseSExprStr), parsedAtomB, factBindings)) {
          let derivedContent = conclusionSExprStr;
          for (const varName in factBindings) {
            derivedContent = derivedContent.replace(new RegExp(varName.replace(/\$/g, '\\$'), 'g'), factBindings[varName]);
          }

          const derivedAtom: SemanticAtom = {
            id: generate_uuid(),
            content: derivedContent,
            embedding: [], // Placeholder
          };
          world_model.add_atom(derivedAtom);

          const derivedTask: Task = {
            id: generate_uuid(),
            atom_id: derivedAtom.id,
            type: TaskType.BELIEF,
            truth: truth_policy.derivation(task_a, task_b, this.id),
            attention: { priority: 0.7, durability: 0.7 }, // Placeholder
            stamp: {
              timestamp: Date.now() / 1000,
              parent_ids: [task_a.id, task_b.id],
              schema_id: this.id,
              scope_bindings: scope_bindings, // Pass along the scope bindings
            },
          };
          derivedTasks.push(derivedTask);
        }
      }
    } catch (e) {
      console.error("Error in DeductionSchema.apply_with_bindings:", e);
    }

    return derivedTasks;
  }
}