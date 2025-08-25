import { ICognitiveSchema, ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { UUID, TaskType } from '../types';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';

export class SafetyAnalysisSchema implements ICognitiveSchema {
  public readonly id: UUID = uuidv4();

  get_trigger_pattern(): TriggerPattern {
    return ['(eats $animal $substance)', '(is_safe_for $animal $substance)'];
  }

  private async _derive(
    task_a: Task,
    task_b: Task,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>,
    scope_bindings?: Record<string, string>
  ): Promise<Task[]> {
    const animal = bindings['$animal'];
    const substance = bindings['$substance'];

    if (!animal || !substance) {
      console.error('SafetyAnalysisSchema: Missing $animal or $substance binding.');
      return [];
    }

    const scope_content = `{(%sub=${substance}, %anim=${animal}), (QUESTION "(is_toxic %sub %anim)?"), (GOAL (execute "llm" query:"is %sub toxic to %anim?"))}`;

    const scope_atom: SemanticAtom = {
      id: uuidv4(),
      content: scope_content,
      embedding: [],
    };
    await world_model.add_atom(scope_atom);

    const scope_task: Task = {
      id: uuidv4(),
      atom_id: scope_atom.id,
      type: TaskType.GOAL,
      attention: { priority: 0.9, durability: 0.9 },
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [task_a.id, task_b.id],
        schema_id: this.id,
        scope_bindings: scope_bindings,
      },
    };

    return [scope_task];
  }

  async apply(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    if (!task_b) {
      return [];
    }
    try {
      return await this._derive(task_a, task_b, truth_policy, world_model, bindings);
    } catch (e) {
      console.error("Error in SafetyAnalysisSchema.apply:", e);
      return [];
    }
  }

  async apply_with_bindings(
    task_a: Task,
    task_b: Task | undefined,
    truth_policy: ITruthPolicy,
    scope_bindings: Record<string, string>,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    if (!task_b) {
      return [];
    }
    try {
      return await this._derive(task_a, task_b, truth_policy, world_model, bindings, scope_bindings);
    } catch (e) {
      console.error("Error in SafetyAnalysisSchema.apply_with_bindings:", e);
      return [];
    }
  }
}
