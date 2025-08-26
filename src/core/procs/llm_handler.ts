import { ProcedureHandler } from '../interfaces';
import { Task, SemanticAtom } from '../models';
import { WorldModel } from '../world-model';
import { v4 as uuidv4 } from 'uuid';
import { TaskType } from '../types';
import { extract_param } from '../procedure';
import { ChatOpenAI } from "@langchain/openai";

export class LLMHandler implements ProcedureHandler {
    name(): string {
        return "llm";
    }

    can_handle(content: string): boolean {
        return content.includes('(execute "llm"');
    }

    async execute(content: string, bindings: Record<string, string>, world_model: WorldModel): Promise<Task[]> {
        const query = extract_param(content, "query");
        if (!query) {
            console.error("LLMHandler: 'query' parameter not found in content.");
            // Create an error belief if the query is missing
            const errorAtom: SemanticAtom = {
                id: uuidv4(),
                content: `(handler_error (handler "llm") (message "Query parameter is missing"))`,
                embedding: [],
            };
            await world_model.add_atom(errorAtom);
            return [{
                id: uuidv4(),
                atom_id: errorAtom.id,
                type: TaskType.BELIEF,
                truth: { frequency: 1.0, confidence: 1.0 },
                attention: { priority: 0.9, durability: 0.9 },
                stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: 'llm-handler-error-schema' },
            }];
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error("LLMHandler: OPENAI_API_KEY environment variable not set.");
            const errorAtom: SemanticAtom = {
                id: uuidv4(),
                content: `(handler_error (handler "llm") (message "OPENAI_API_KEY is not set"))`,
                embedding: [],
            };
            await world_model.add_atom(errorAtom);
            return [{
                id: uuidv4(),
                atom_id: errorAtom.id,
                type: TaskType.BELIEF,
                truth: { frequency: 1.0, confidence: 1.0 },
                attention: { priority: 0.9, durability: 0.9 },
                stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: 'llm-handler-error-schema' },
            }];
        }

        try {
            const llm = new ChatOpenAI({
                temperature: 0.7,
                modelName: "gpt-4",
            });

            const response = await llm.invoke(query);
            const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

            const resultAtom: SemanticAtom = {
                id: uuidv4(),
                content: `(llm_result (query "${query}") (answer "${answer.replace(/"/g, '\\"')}") )`,
                embedding: [], // Placeholder for future embedding
            };
            await world_model.add_atom(resultAtom);

            const resultTask: Task = {
                id: uuidv4(),
                atom_id: resultAtom.id,
                type: TaskType.BELIEF,
                truth: { frequency: 0.9, confidence: 0.9 },
                attention: { priority: 0.8, durability: 0.8 },
                stamp: {
                    timestamp: Date.now() / 1000,
                    parent_ids: [], // This will be filled in by the engine
                    schema_id: 'llm-handler-schema',
                },
            };

            return [resultTask];

        } catch (e: any) {
            console.error("Error executing LLM procedure:", e);
            const errorAtom: SemanticAtom = {
                id: uuidv4(),
                content: `(execution_error (handler "llm") (message "${e.message || String(e)}"))`,
                embedding: [],
            };
            await world_model.add_atom(errorAtom);
            return [{
                id: uuidv4(),
                atom_id: errorAtom.id,
                type: TaskType.BELIEF,
                truth: { frequency: 1.0, confidence: 1.0 },
                attention: { priority: 0.95, durability: 0.9 },
                stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: 'llm-handler-execution-error-schema' },
            }];
        }
    }
}
