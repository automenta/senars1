import { SemanticAtom, Task, TruthValue } from './models';
import { UUID, Vector } from './types';
import { IResonanceStrategy, ITruthPolicy, VectorDB, PatternMatcher, ICognitiveSchema } from './interfaces';
import { SchemaRegistry } from './schema-registry';
import { InMemoryVectorDB, InMemoryPatternMatcher } from './implementations';

function is_schema_pattern(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }
  const var_start = trimmed.indexOf('(');
  const var_end = trimmed.indexOf(')');
  if (var_start === -1 || var_end === -1 || var_start > var_end) {
    return false;
  }
  const body_separator = trimmed.indexOf(',');
  if (body_separator === -1 || var_end > body_separator) {
    return false;
  }
  return true;
}

export class WorldModel {
  private resonance: IResonanceStrategy;
  private truth_policy: ITruthPolicy; 
  public atoms: Record<UUID, SemanticAtom> = {};
  public tasks: Record<UUID, Task> = {};
  public semantic_index: VectorDB;
  public symbolic_index: Record<string, UUID[]> = {};
  public schema_index: PatternMatcher;

  constructor(resonance: IResonanceStrategy, truth_policy: ITruthPolicy) {
    this.resonance = resonance;
    this.truth_policy = truth_policy;
    this.semantic_index = new InMemoryVectorDB();
    this.symbolic_index = {}; // Initialize as empty object
    this.schema_index = new InMemoryPatternMatcher();
  }

  add_atom(atom: SemanticAtom): void {
    this.atoms[atom.id] = atom;
    this.semantic_index.add(atom.embedding, atom.id);
    
    if (!this.symbolic_index[atom.content]) {
      this.symbolic_index[atom.content] = [];
    }
    this.symbolic_index[atom.content].push(atom.id);

    if (is_schema_pattern(atom.content)) {
      this.schema_index.add(atom.content, atom.id);
    }
  }

  add_task(task: Task): void {
    if (task.type === 'BELIEF') {
      const existing = this.find_belief(task.atom_id);
      if (existing) {
        task.truth = this.truth_policy.revision(existing, task);
        this.tasks[existing.id] = task;
        return;
      }
    }
    this.tasks[task.id] = task;
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

  find_schemas(task_a: Task, task_b: Task): ICognitiveSchema[] {
    const atom_a = this.get_atom(task_a.atom_id);
    const atom_b = this.get_atom(task_b.atom_id);
    const schema_ids = this.schema_index.match(atom_a.content, atom_b.content);
    const schemaRegistry = SchemaRegistry.getInstance();
    return schema_ids.map(schema_id => schemaRegistry.get(schema_id)).filter(s => s !== undefined) as ICognitiveSchema[];
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
}