import { ICognitiveSchema, ITruthPolicy } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { UUID, TaskType } from '../types';
import { parseSExpression, sExpressionToString, SExpression } from '../s-expression';
import { substituteInContent } from '../scope';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';

function generate_uuid(prefix: string = ''): UUID {
  return `${prefix}-${uuidv4()}`;
}

export class InductionSchema implements ICognitiveSchema {
  public readonly id: UUID = generate_uuid("induction_schema");

  get_trigger_pattern(): string {
    // This schema is more general and doesn't have a fixed trigger pattern in the same way as deduction or abduction.
    // It will look for two facts that share a common term.
    return "($P $A $B) and ($Q $A $C)";
  }

  private find_common_term(s_expr1: SExpression, s_expr2: SExpression): string | null {
    if (typeof s_expr1 === 'string' || typeof s_expr2 === 'string') {
      return null;
    }
    const terms1 = new Set(s_expr1.args.map(s => sExpressionToString(s)));
    const terms2 = s_expr2.args.map(s => sExpressionToString(s));

    for (const term of terms2) {
      if (terms1.has(term)) {
        return term;
      }
    }
    return null;
  }

  private generalize(s_expr: SExpression | string, common_term: string, variable: string): SExpression | string {
    if (typeof s_expr === 'string') {
      return s_expr === common_term ? variable : s_expr;
    }

    return {
        head: this.generalize(s_expr.head, common_term, variable) as string,
        args: s_expr.args.map(arg => this.generalize(arg, common_term, variable))
    };
  }

  apply(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel
  ): Task[] {
    const atom_a = world_model.get_atom(task_a.atom_id);
    const atom_b = world_model.get_atom(task_b.atom_id);

    const s_expr_a = parseSExpression(atom_a.content);
    const s_expr_b = parseSExpression(atom_b.content);

    const common_term = this.find_common_term(s_expr_a, s_expr_b);

    if (common_term) {
      const variable = "$X";
      const generalized_a = this.generalize(s_expr_a, common_term, variable) as SExpression;
      const generalized_b = this.generalize(s_expr_b, common_term, variable) as SExpression;

      const implication_content = sExpressionToString({head: 'implies', args: [generalized_a, generalized_b]});

      const derivedAtom: SemanticAtom = {
        id: generate_uuid(),
        content: implication_content,
        embedding: [],
      };
      world_model.add_atom(derivedAtom);

      const derivedTask: Task = {
        id: generate_uuid(),
        atom_id: derivedAtom.id,
        type: TaskType.BELIEF,
        truth: truth_policy.derivation(task_a, task_b, this.id),
        attention: { priority: 0.5, durability: 0.5 }, // Inductions are less certain
        stamp: {
          timestamp: Date.now() / 1000,
          parent_ids: [task_a.id, task_b.id],
          schema_id: this.id,
        },
      };
      return [derivedTask];
    }

    return [];
  }

  apply_with_bindings(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel
  ): Task[] {
    // Induction doesn't typically work with pre-defined scope bindings in this context.
    // We are generating a new general rule, not applying a scoped one.
    return this.apply(task_a, task_b, truth_policy, world_model);
  }
}
