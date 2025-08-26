import { ITruthPolicy, TriggerPattern } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { BaseSchema } from './base_schema';
import { generateUUID, createDerivedTask } from './utils';
import { TaskType } from '../types';
import { sExpressionToString } from '../s-expression';

export class QuestionAnsweringSchema extends BaseSchema {
  constructor() {
    super('question_answering_schema');
  }

  get_trigger_pattern(): TriggerPattern {
    // This schema triggers on any task that is a question.
    // The pattern captures the entire content of the question task.
    return '($question)';
  }

  protected async _derive(
    question_task: Task,
    _task_b: undefined, // This is a single-premise schema
    truth_policy: ITruthPolicy,
    world_model: WorldModel,
    bindings: Record<string, string>
  ): Promise<Task[]> {
    // Ensure this schema only runs on tasks of type QUESTION.
    if (question_task.type !== TaskType.QUESTION) {
      return [];
    }

    const questionContent = bindings['$question'];
    if (!questionContent) {
      return [];
    }

    // Convert the S-expression question into a natural language query string.
    // e.g., "(is_toxic chocolate cat)" -> "is toxic chocolate cat?"
    const naturalLanguageQuery = `${questionContent.replace(/[()]/g, '')}?`;

    const derivedContent = `(execute "llm" query:"${naturalLanguageQuery}")`;

    const derivedAtom: SemanticAtom = {
      id: generateUUID('atom'),
      content: derivedContent,
      embedding: [], // Embedding could be added for the procedure call itself
    };
    await world_model.add_atom(derivedAtom);

    const derivedTask = createDerivedTask({
      atom_id: derivedAtom.id,
      type: TaskType.GOAL, // The result is a GOAL to execute the LLM call
      attention: {
        priority: question_task.attention.priority, // Inherit attention from the question
        durability: question_task.attention.durability
      },
      parent_ids: [question_task.id],
      schema_id: this.id,
    });

    return [derivedTask];
  }
}
