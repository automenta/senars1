import { Mutex } from 'async-mutex';
import { SemanticAtom, Task, TruthValue } from './models';
import { UUID, Vector } from './types';
import { IResonanceStrategy, ITruthPolicy, VectorDB, PatternMatcher, ICognitiveSchema, MatchResult } from './interfaces';
import { SchemaRegistry } from './schema-registry';
import { InMemoryVectorDB, InMemoryPatternMatcher } from './implementations';
import { is_schema_pattern } from './utils';


export class WorldModel {
  private resonance: IResonanceStrategy;
  private truth_policy: ITruthPolicy;
  private schema_registry: SchemaRegistry;
  public atoms: Record<UUID, SemanticAtom> = {};
  public tasks: Record<UUID, Task> = {};
  public semantic_index: VectorDB;
  public symbolic_index: Record<string, UUID[]> = {};
  public schema_index: PatternMatcher;
  private mutex: Mutex;

  constructor(resonance: IResonanceStrategy, truth_policy: ITruthPolicy, schema_registry: SchemaRegistry, schema_index?: PatternMatcher) {
    this.resonance = resonance;
    this.truth_policy = truth_policy;
    this.schema_registry = schema_registry;
    this.semantic_index = new InMemoryVectorDB();
    this.symbolic_index = {}; // Initialize as empty object
    this.schema_index = schema_index || new InMemoryPatternMatcher();
    this.mutex = new Mutex();
  }

  async add_atom(atom: SemanticAtom): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.atoms[atom.id] = atom;
      this.semantic_index.add(atom.embedding, atom.id);

      if (!this.symbolic_index[atom.content]) {
        this.symbolic_index[atom.content] = [];
      }
      this.symbolic_index[atom.content].push(atom.id);

      // Register schemas
      if (is_schema_pattern(atom.content)) {
        // Here, the atom's content itself is the trigger pattern.
        // We associate this pattern with the atom's ID, which acts as the schema_id.
        this.schema_index.add(atom.content, atom.id);
      }
    });
  }

  async add_task(task: Task): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (task.type === 'BELIEF') {
        const existing = this.find_belief(task.atom_id);
        if (existing) {
          // Update the existing task with the revised truth value
          existing.truth = this.truth_policy.revision(existing, task);
          // Also update attention, as the new task might have higher priority
          existing.attention = task.attention;
          return;
        }
      }
      this.tasks[task.id] = task;
    });
  }

  find_belief(atom_id: UUID): Task | undefined {
    for (const task of Object.values(this.tasks)) {
      if (task.type === 'BELIEF' && task.atom_id === atom_id) {
        return task;
      }
    }
    return undefined;
  }

  find_resonant(focus: Task, k: number): Task[] {
    return this.resonance.find_context(focus, this, k);
  }

  find_dual_premise_schemas(task_a: Task, task_b: Task): MatchResult[] {
    const atom_a = this.get_atom(task_a.atom_id);
    const atom_b = this.get_atom(task_b.atom_id);
    return this.schema_index.match_dual(atom_a.content, atom_b.content);
  }

  find_single_premise_schemas(task: Task): MatchResult[] {
    const atom = this.get_atom(task.atom_id);
    return this.schema_index.match_single(atom.content);
  }

  get_atom(atom_id: UUID): SemanticAtom {
    const atom = this.atoms[atom_id];
    if (!atom) {
      throw new Error(`SemanticAtom with ID ${atom_id} not found.`);
    }
    return atom;
  }

  get_task(task_id: UUID): Task {
    const task = this.tasks[task_id];
    if (!task) {
      throw new Error(`Task with ID ${task_id} not found.`);
    }
    return task;
  }

  async remove_task(task_id: UUID): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const task = this.tasks[task_id];
      if (!task) {
        return;
      }

      const atom_id_to_remove = task.atom_id;
      delete this.tasks[task_id];

      // Check if any other task uses the same atom
      const is_atom_used_elsewhere = Object.values(this.tasks).some(
        t => t.atom_id === atom_id_to_remove
      );

      if (!is_atom_used_elsewhere) {
        const atom = this.atoms[atom_id_to_remove];
        if (atom) {
          // Remove from symbolic index
          const symbolic_list = this.symbolic_index[atom.content];
          if (symbolic_list) {
            const index = symbolic_list.indexOf(atom.id);
            if (index > -1) {
              symbolic_list.splice(index, 1);
            }
            if (symbolic_list.length === 0) {
              delete this.symbolic_index[atom.content];
            }
          }
          // remove from semantic index
          this.semantic_index.remove(atom.id);

          // If it's a schema, remove from schema index as well
          if (is_schema_pattern(atom.content)) {
            this.schema_index.remove(atom.content, atom.id);
          }

          delete this.atoms[atom_id_to_remove];
        }
      }
    });
  }
}