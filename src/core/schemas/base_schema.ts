import { ICognitiveSchema, ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task } from '../models';
import { UUID } from '../types';
import { WorldModel } from '../world-model';
import { generateUUID } from './utils';

/**
 * An abstract base class for cognitive schemas that provides common functionality.
 * It handles ID generation and provides a standard implementation for the `apply`
 * and `apply_with_bindings` methods, which includes error handling.
 * Subclasses are required to implement the `get_trigger_pattern` and `_derive` methods.
 */
export abstract class BaseSchema implements ICognitiveSchema {
  /**
   * A unique identifier for the schema instance.
   */
  public readonly id: UUID;

  /**
   * @param {string} prefix - A prefix for the schema's ID, typically the schema name.
   */
  constructor(prefix: string) {
    this.id = generateUUID(prefix);
  }

  /**
   * Returns the trigger pattern for the schema.
   * This must be implemented by subclasses.
   */
  abstract get_trigger_pattern(): TriggerPattern;

  /**
   * The core derivation logic for the schema.
   * This method is called by `apply` and `apply_with_bindings` and must be implemented by subclasses.
   * @param {Task} task_a - The first task.
   * @param {Task | undefined} task_b - The second task (optional).
   * @param {ITruthPolicy} truth_policy - The truth policy to use.
   * @param {WorldModel} world_model - The world model.
   * @param {Record<string, string>} bindings - The bindings from the pattern match.
   * @param {Record<string, string>} [scope_bindings] - The scope bindings (optional).
   * @returns {Promise<Task[]>} A promise that resolves to an array of derived tasks.
   */
  protected abstract _derive(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Promise<Task[]>;

  /**
   * Applies the schema to two tasks without scope bindings.
   * This method wraps the call to `_derive` with error handling.
   */
  public async apply(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    try {
      return await this._derive(task_a, task_b, truth_policy, world_model, bindings);
    } catch (e) {
      console.error(`Error in ${this.constructor.name}.apply:`, e);
      return [];
    }
  }

  /**
   * Applies the schema to two tasks with scope bindings.
   * This method wraps the call to `_derive` with error handling.
   */
  public async apply_with_bindings(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    try {
      return await this._derive(task_a, task_b, truth_policy, world_model, bindings, scope_bindings);
    } catch (e) {
      console.error(`Error in ${this.constructor.name}.apply_with_bindings:`, e);
      return [];
    }
  }
}
