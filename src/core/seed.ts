import { v4 as uuidv4 } from 'uuid';
import { WorldModel } from './world-model';
import { PriorityQueue } from './agenda';
import { Task, SemanticAtom } from './models';
import { TaskType } from './types';
import { DefaultAttentionPolicy } from './implementations';

export function seed_data(
  world_model: WorldModel,
  agenda: PriorityQueue,
  attention_policy: DefaultAttentionPolicy
) {
  const atom_premise: SemanticAtom = { id: uuidv4(), content: '(is_cat Socrates)', embedding: [] };
  const atom_implication: SemanticAtom = { id: uuidv4(), content: '(implies (is_cat Socrates) (is_mortal Socrates))', embedding: [] };
  world_model.add_atom(atom_premise);
  world_model.add_atom(atom_implication);

  const task_premise: Task = {
    id: uuidv4(),
    atom_id: atom_premise.id,
    type: TaskType.BELIEF,
    truth: { frequency: 1.0, confidence: 0.9 },
    attention: { priority: 0.9, durability: 0.9 },
    stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() }
  };
  const task_implication: Task = {
    id: uuidv4(),
    atom_id: atom_implication.id,
    type: TaskType.BELIEF,
    truth: { frequency: 1.0, confidence: 0.9 },
    attention: { priority: 0.8, durability: 0.9 },
    stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() }
  };
  agenda.push(task_premise);
  agenda.push(task_implication);

  const atom_eats_chocolate: SemanticAtom = {
    id: uuidv4(),
    content: "(eats cat chocolate)",
    embedding: [],
  };
  world_model.add_atom(atom_eats_chocolate);
  const task_eats_chocolate: Task = {
    id: uuidv4(),
    atom_id: atom_eats_chocolate.id,
    type: TaskType.BELIEF,
    truth: { frequency: 0.8, confidence: 0.7 },
    attention: { priority: 0.6, durability: 0.5 },
    stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() },
  };
  agenda.push(task_eats_chocolate);

  const atom_is_safe_goal: SemanticAtom = {
    id: uuidv4(),
    content: "(is_safe_for cat chocolate)",
    embedding: [],
  };
  world_model.add_atom(atom_is_safe_goal);
  const task_is_safe_goal: Task = {
    id: uuidv4(),
    atom_id: atom_is_safe_goal.id,
    type: TaskType.GOAL,
    attention: { priority: 0.9, durability: 0.8 },
    stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() },
  };
  agenda.push(task_is_safe_goal);

  const scope_atom: SemanticAtom = {
    id: uuidv4(),
    content: '{(%sub=chocolate, %anim=cat), ' +
             '(QUESTION "(is_toxic %sub %anim)?"), ' +
             '(GOAL (execute "llm" query:"is %sub toxic to %anim?"))}',
    embedding: [],
  };
  world_model.add_atom(scope_atom);
  const scope_task: Task = {
    id: uuidv4(),
    atom_id: scope_atom.id,
    type: TaskType.GOAL,
    attention: attention_policy.calculate_derived(task_eats_chocolate, task_is_safe_goal, uuidv4()),
    stamp: {
      timestamp: Date.now() / 1000,
      parent_ids: [task_eats_chocolate.id, task_is_safe_goal.id],
      schema_id: uuidv4(),
    },
  };
  agenda.push(scope_task);
}
