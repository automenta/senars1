import { UUID, Timestamp, Vector, TaskType } from './types';

export interface SemanticAtom {
  id: UUID;
  content: string;
  embedding: Vector;
  meta?: Record<string, any>;
}

export interface TruthValue {
  frequency: number;
  confidence: number;
}

export interface AttentionValue {
  priority: number;
  durability: number;
}

export interface DerivationStamp {
  timestamp: Timestamp;
  parent_ids: UUID[];
  schema_id: UUID;
  scope_bindings?: Record<string, string>;
    path?: string[]; // Human-readable derivation path
}

export interface Task {
  id: UUID;
  atom_id: UUID;
  type: TaskType;
  truth?: TruthValue;
  attention: AttentionValue;
  stamp: DerivationStamp;
    verified?: boolean;
}
