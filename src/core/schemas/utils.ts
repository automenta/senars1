import { v4 as uuidv4 } from 'uuid';
import { UUID, TaskType } from '../types';
import { Task, TruthValue, AttentionValue } from '../models';

/**
 * Generates a unique identifier (UUID) with an optional prefix.
 * @param {string} [prefix=''] - An optional prefix for the UUID.
 * @returns {UUID} The generated UUID.
 */
export function generateUUID(prefix: string = ''): UUID {
  const new_uuid = uuidv4();
  return prefix ? `${prefix}-${new_uuid}` : new_uuid;
}

export interface CreateDerivedTaskProps {
  atom_id: UUID;
  truth: TruthValue;
  attention: AttentionValue;
  parent_ids: UUID[];
  schema_id: UUID;
  scope_bindings?: Record<string, string>;
}

/**
 * Creates a new derived task object.
 * This utility function standardizes the creation of BELIEF tasks that result from schema application.
 * @param {CreateDerivedTaskProps} props - The properties for the new task.
 * @returns {Task} The newly created task.
 */
export function createDerivedTask(props: CreateDerivedTaskProps): Task {
  const { atom_id, truth, attention, parent_ids, schema_id, scope_bindings } = props;

  const derivedTask: Task = {
    id: generateUUID('task'),
    atom_id: atom_id,
    type: TaskType.BELIEF,
    truth: truth,
    attention: attention,
    stamp: {
      timestamp: Date.now() / 1000,
      parent_ids: parent_ids,
      schema_id: schema_id,
      scope_bindings: scope_bindings,
    },
  };

  return derivedTask;
}
