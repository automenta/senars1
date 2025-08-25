import { ICognitiveSchema, ITruthPolicy } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { parseSExpression, sExpressionToString, SExpression } from '../s-expression';
import { WorldModel } from '../world-model';
import { generateUUID, createDerivedTask } from './utils';
import { UUID } from '../types';

export class InductionSchema implements ICognitiveSchema {
  public readonly id: UUID = generateUUID("induction_schema");

  get_trigger_pattern(): string {
    // This schema is more general and doesn't have a fixed trigger pattern in the same way as deduction or abduction.
    // It will look for two facts that share a common term.
    return "($P $A $B) and ($Q $A $C)";
  }

  private get_all_terms(s_expr: SExpression, terms: Set<string>): void {
    if (typeof s_expr === 'string') {
        terms.add(s_expr);
        return;
    }
    this.get_all_terms(s_expr.head, terms);
    for (const arg of s_expr.args) {
        this.get_all_terms(arg, terms);
    }
  }

  private find_common_term(s_expr1: SExpression, s_expr2: SExpression): string | null {
    const terms1 = new Set<string>();
    this.get_all_terms(s_expr1, terms1);

    const terms2 = new Set<string>();
    this.get_all_terms(s_expr2, terms2);

    for (const term of Array.from(terms2)) {
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

  async apply(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    // bindings are not used in induction, but are part of the interface
    bindings: Record<string, string>
  ): Promise<Task[]> {
    if (!task_b) {
      return [];
    }
    const atom_a = world_model.get_atom(task_a.atom_id);
    const atom_b = world_model.get_atom(task_b.atom_id);

    const s_expr_a = parseSExpression(atom_a.content);
    const s_expr_b = parseSExpression(atom_b.content);

    const common_term = this.find_common_term(s_expr_a, s_expr_b);

    if (common_term) {
      if (typeof s_expr_a !== 'string' && sExpressionToString(s_expr_a.head) === common_term) {
          return []; // Do not generalize on the predicate
      }
      if (typeof s_expr_b !== 'string' && sExpressionToString(s_expr_b.head) === common_term) {
          return []; // Do not generalize on the predicate
      }

      const variable = "$X";
      const generalized_a = this.generalize(s_expr_a, common_term, variable) as SExpression;
      const generalized_b = this.generalize(s_expr_b, common_term, variable) as SExpression;

      // Avoid creating tautologies like (implies ($X) ($X))
      if (sExpressionToString(generalized_a) === sExpressionToString(generalized_b)) {
          return [];
      }

      const implication_content = sExpressionToString({head: 'implies', args: [generalized_a, generalized_b]});

      const derivedAtom: SemanticAtom = {
        id: generateUUID('atom'),
        content: implication_content,
        embedding: [],
      };
      await world_model.add_atom(derivedAtom);

      const derivedTask = createDerivedTask({
        atom_id: derivedAtom.id,
        truth: truth_policy.derivation(task_a, task_b, this.id),
        attention: { priority: 0.5, durability: 0.5 }, // Inductions are less certain
        parent_ids: [task_a.id, task_b.id],
        schema_id: this.id,
      });

      return [derivedTask];
    }

    return [];
  }

  async apply_with_bindings(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    // Induction doesn't typically work with pre-defined scope bindings or pattern bindings in this context.
    // We are generating a new general rule, not applying a scoped one.
    return await this.apply(task_a, task_b, truth_policy, world_model, bindings);
  }
}
