import { SemanticAtom, Task, TruthValue } from './models';
import { UUID, Vector } from './types';
import { IResonanceStrategy, ITruthPolicy, VectorDB, PatternMatcher, ICognitiveSchema } from './interfaces';
import { SchemaRegistry } from './schema-registry';
import { InMemoryVectorDB, InMemoryPatternMatcher } from './implementations';

/**
 * Checks if a given content string conforms to the basic structure of a scope expression,
 * which is used for atom-based schemas.
 *
 * A valid scope expression must:
 * 1. Start with '{' and end with '}'.
 * 2. Contain a variable declaration block '(...)'
 * 3. The variable block must precede the first comma that separates the body.
 *
 * @param content The string content of a SemanticAtom.
 * @returns True if the content is a potential schema pattern, false otherwise.
 */
function is_schema_pattern(content: string): boolean {
  const trimmed_content = content.trim();

  // 1. Must start with '{' and end with '}'
  if (!trimmed_content.startsWith('{') || !trimmed_content.endsWith('}')) {
    return false;
  }

  // 2. Must contain a variable declaration block '(...)'
  const var_block_start = trimmed_content.indexOf('(');
  const var_block_end = trimmed_content.indexOf(')');
  if (var_block_start === -1 || var_block_end === -1 || var_block_start > var_block_end) {
    return false;
  }

  // 3. The variable block must appear before the first comma that separates the body.
  const body_separator = trimmed_content.indexOf(',');
  if (body_separator === -1 || var_block_end > body_separator) {
    // If there is no comma, it's not a valid scope with a body.
    // If the ')' is after the first comma, the structure is wrong.
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
    // Only BELIEF tasks are permanently stored in the WorldModel's task list.
    // GOALs, QUESTIONs, etc., exist ephemerally in the Agenda.
    if (task.type !== 'BELIEF') {
      this.tasks[task.id] = task;
      return;
    }

    const existing_belief = this.find_belief(task.atom_id);

    if (existing_belief) {
      // If a belief with the same content already exists, revise it.
      const new_truth = this.truth_policy.revision(existing_belief, task);

      // Update the existing belief with the new truth value.
      existing_belief.truth = new_truth;

      // Also boost the attention of the existing belief as it has been reinforced.
      // A simple strategy is to take the max of the priority and durability.
      existing_belief.attention.priority = Math.max(
        existing_belief.attention.priority,
        task.attention.priority
      );
      existing_belief.attention.durability = Math.max(
        existing_belief.attention.durability,
        task.attention.durability
      );

      // The incoming task is now discarded as its information has been integrated.
    } else {
      // If no existing belief is found, add the new task.
      this.tasks[task.id] = task;
    }
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