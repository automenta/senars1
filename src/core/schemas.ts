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

  private _derive(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    scope_bindings?: Record<string, string>
  ): Task[] {
    const derivedTasks: Task[] = [];
    const implicationPattern = parseSExpression(this.get_trigger_pattern());

    const try_match = (implication_task: Task, fact_task: Task) => {
        let implication_atom = world_model.get_atom(implication_task.atom_id);
        let fact_atom = world_model.get_atom(fact_task.atom_id);

        let implication_content = implication_atom.content;
        let fact_content = fact_atom.content;

        if (scope_bindings) {
            implication_content = substituteInContent(implication_content, scope_bindings);
            fact_content = substituteInContent(fact_content, scope_bindings);
        }

        const parsed_implication = parseSExpression(implication_content);
        const parsed_fact = parseSExpression(fact_content);

        const bindings: Record<string, string> = {};
        if (matchSExpressionPattern(implicationPattern, parsed_implication, bindings)) {
            const premiseSExprStr = bindings["$PREMISE"];
            const conclusionSExprStr = bindings["$CONCLUSION"];

            const factBindings: Record<string, string> = {};
            if (matchSExpressionPattern(parseSExpression(premiseSExprStr), parsed_fact, factBindings)) {
                let derivedContent = conclusionSExprStr;
                for (const varName in factBindings) {
                    derivedContent = derivedContent.replace(new RegExp(varName.replace(/\$/g, '\\$'), 'g'), factBindings[varName]);
                }

                const derivedAtom: SemanticAtom = {
                    id: generate_uuid(),
                    content: derivedContent,
                    embedding: [],
                };
                world_model.add_atom(derivedAtom);

                const derivedTask: Task = {
                    id: generate_uuid(),
                    atom_id: derivedAtom.id,
                    type: TaskType.BELIEF,
                    truth: truth_policy.derivation(implication_task, fact_task, this.id),
                    attention: { priority: 0.7, durability: 0.7 },
                    stamp: {
                        timestamp: Date.now() / 1000,
                        parent_ids: [implication_task.id, fact_task.id],
                        schema_id: this.id,
                        scope_bindings: scope_bindings,
                    },
                };
                derivedTasks.push(derivedTask);
            }
        }
    };

    try_match(task_a, task_b);
    if (derivedTasks.length === 0) {
        try_match(task_b, task_a);
    }

    return derivedTasks;
  }

  apply(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel
  ): Task[] {
    try {
        return this._derive(task_a, task_b, truth_policy, world_model);
    } catch (e) {
        console.error("Error in DeductionSchema.apply:", e);
        return [];
    }
  }

  apply_with_bindings(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel
  ): Task[] {
    try {
        return this._derive(task_a, task_b, truth_policy, world_model, scope_bindings);
    } catch (e) {
        console.error("Error in DeductionSchema.apply_with_bindings:", e);
        return [];
    }
  }
}