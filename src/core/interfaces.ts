import { Task, AttentionValue, TruthValue, SemanticAtom } from './models';
import { UUID } from './types';
import { WorldModel } from './world-model';

export interface IAttentionPolicy {
  calculate_initial(task: Task): AttentionValue;
  calculate_derived(task_a: Task, task_b: Task, schema_id: UUID): AttentionValue;
  decay(task: Task, elapsed: number): AttentionValue;
}

export interface ITruthPolicy {
  revision(belief_a: Task, belief_b: Task): TruthValue;
  derivation(premise_a: Task, premise_b: Task, schema_id: UUID): TruthValue;
}

export interface IResonanceStrategy {
  find_context(
    focus: Task,
    world_model: WorldModel,
    k: number,
    scope_bindings?: Record<string, string>
  ): Task[];
}

export type TriggerPattern = [string, string] | string;

export interface ICognitiveSchema {
  id: UUID;
  get_trigger_pattern(): TriggerPattern;
  apply(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Task[];

  apply_with_bindings(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Task[];
}

export interface ProcedureHandler {
  name(): string;
  can_handle(content: string): boolean;
  execute(
    content: string,
    bindings: Record<string, string>,
    world_model: WorldModel
  ): Promise<Task[]>;
}

export interface VectorDB {
  add(embedding: Vector, atom_id: UUID): void;
  find_nearest(embedding: Vector, k: number): UUID[];
  remove(atom_id: UUID): void;
}

export interface MatchResult {
    schema_id: UUID;
    bindings: Record<string, string>;
}

export interface PatternMatcher {
  add(pattern: TriggerPattern, schema_id: UUID): void;
  remove(pattern: TriggerPattern, schema_id: UUID): void;
  match_dual(content_a: string, content_b: string): MatchResult[];
  match_single(content: string): MatchResult[];
  has(pattern: TriggerPattern, schema_id: UUID): boolean;
}