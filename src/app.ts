import { v4 as uuidv4 } from 'uuid';
import { WorldModel } from './core/world-model';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler } from './core/implementations';
import { Task, SemanticAtom } from './core/models';
import { TaskType } from './core/types';
import { ProcedureHandler } from './core/interfaces';
import { PriorityQueue } from './core/agenda';
import { resolveScopeBindings, substituteInContent } from './core/scope';
import { is_procedure_task, execute_procedure, extract_handler_name, extract_param } from './core/procedure';
import { SchemaRegistry } from './core/schema-registry';
import { DeductionSchema } from './core/schemas';

export interface GuiTask extends Task {
  content: string;
  priority_text: string; // e.g., HIGH, MEDIUM, LOW
  related_to?: string; // e.g., "Cat ate chocolate" (70% confidence)
  next_step?: string; // e.g., Research toxicity (LLM query running...)
  created_ago?: string; // e.g., 2m ago
  retains_for?: string; // e.g., 8m
  path_history?: string; // e.g., User question → Safety schema activation
  source?: string; // e.g., LLM research
  completed_ago?: string; // e.g., 1m ago
  verification_status?: string; // e.g., Verified by user
  knowledge_retention?: string; // e.g., Strong
}

export class App {
  private world_model: WorldModel;
  private agenda: PriorityQueue;
  private attention_policy: DefaultAttentionPolicy;
  private truth_policy: DefaultTruthPolicy;
  private resonance_strategy: DefaultResonanceStrategy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private schema_registry: SchemaRegistry;

  constructor() {
    this.attention_policy = new DefaultAttentionPolicy();
    this.truth_policy = new DefaultTruthPolicy();
    this.resonance_strategy = new DefaultResonanceStrategy();
    this.world_model = new WorldModel(this.resonance_strategy, this.truth_policy);
    this.agenda = new PriorityQueue();
    this.procedure_handlers = {};
    this.schema_registry = SchemaRegistry.getInstance();

    // Register procedure handlers
    const llmHandler = new LLMHandler();
    this.procedure_handlers[llmHandler.name()] = llmHandler;

    // Register schemas
    const deductionSchema = new DeductionSchema();
    this.schema_registry.register(deductionSchema);

    this.seed_data();
  }

  private seed_data() {
    // Seed data for deduction: (implies (is_cat Socrates) (is_mortal Socrates))
    const atom_premise: SemanticAtom = { id: uuidv4(), content: '(is_cat Socrates)', embedding: [] };
    const atom_implication: SemanticAtom = { id: uuidv4(), content: '(implies (is_cat Socrates) (is_mortal Socrates))', embedding: [] };
    this.world_model.add_atom(atom_premise);
    this.world_model.add_atom(atom_implication);

    const task_premise: Task = {
      id: uuidv4(),
      atom_id: atom_premise.id,
      type: TaskType.BELIEF,
      truth: { frequency: 1.0, confidence: 0.9 },
      attention: { priority: 0.9, durability: 0.9 },
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() } // Use uuidv4 for schema_id
    };
    const task_implication: Task = {
      id: uuidv4(),
      atom_id: atom_implication.id,
      type: TaskType.BELIEF,
      truth: { frequency: 1.0, confidence: 0.9 },
      attention: { priority: 0.8, durability: 0.9 },
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() } // Use uuidv4 for schema_id
    };
    this.agenda.push(task_premise);
    this.agenda.push(task_implication);

    // Example from core.md: "My cat ate chocolate. Is it dangerous?"
    const atom_eats_chocolate: SemanticAtom = {
      id: uuidv4(),
      content: "(eats cat chocolate)",
      embedding: [],
    };
    this.world_model.add_atom(atom_eats_chocolate);
    const task_eats_chocolate: Task = {
      id: uuidv4(),
      atom_id: atom_eats_chocolate.id,
      type: TaskType.BELIEF,
      truth: { frequency: 0.8, confidence: 0.7 },
      attention: { priority: 0.6, durability: 0.5 },
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() },
    };
    this.agenda.push(task_eats_chocolate);

    const atom_is_safe_goal: SemanticAtom = {
      id: uuidv4(),
      content: "(is_safe_for cat chocolate)",
      embedding: [],
    };
    this.world_model.add_atom(atom_is_safe_goal);
    const task_is_safe_goal: Task = {
      id: uuidv4(),
      atom_id: atom_is_safe_goal.id,
      type: TaskType.GOAL,
      attention: { priority: 0.9, durability: 0.8 },
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() },
    };
    this.agenda.push(task_is_safe_goal);

    // Safety Analysis Schema Activation (example from core.md)
    const scope_atom: SemanticAtom = {
      id: uuidv4(),
      content: '{(%sub=chocolate, %anim=cat), ' +
               '(QUESTION "(is_toxic %sub %anim)?"), ' +
               '(GOAL (execute "llm" query:"is %sub toxic to %anim?"))}',
      embedding: [],
    };
    this.world_model.add_atom(scope_atom);
    const scope_task: Task = {
      id: uuidv4(),
      atom_id: scope_atom.id,
      type: TaskType.GOAL,
      attention: this.attention_policy.calculate_derived(task_eats_chocolate, task_is_safe_goal, uuidv4()), // Placeholder schema_id
      stamp: {
        timestamp: Date.now() / 1000,
        parent_ids: [task_eats_chocolate.id, task_is_safe_goal.id],
        schema_id: uuidv4("safety_schema"),
      },
    };
    this.agenda.push(scope_task);
  }

  public async tick() {
    if (this.agenda.isEmpty()) return;

    const task_a = this.agenda.pop();

    const context = this.world_model.find_resonant(task_a, 10);

    let scope_bindings: Record<string, string> | undefined = undefined;
    if (context.length > 0) {
      scope_bindings = resolveScopeBindings(task_a, context[0], this.world_model);
    }

    if (task_a.type === TaskType.PROCEDURE) {
      const results = execute_procedure(
        task_a,
        this.world_model,
        this.procedure_handlers,
        scope_bindings
      );
      for (const result_task of results) {
        result_task.stamp = {
          timestamp: Date.now() / 1000,
          parent_ids: [task_a.id],
          schema_id: task_a.stamp.schema_id, 
          scope_bindings: scope_bindings,
        };
        this.agenda.push(result_task);
      }
    } else {
      for (const task_b of context) {
        const schemas = this.world_model.find_schemas(task_a, task_b);
        for (const schema of schemas) {
          let derived: Task[] = [];
          if (scope_bindings) {
            derived = schema.apply_with_bindings(
              task_a, task_b, this.truth_policy, scope_bindings, this.world_model
            );
          } else {
            derived = schema.apply(task_a, task_b, this.truth_policy, this.world_model);
          }

          for (const new_task of derived) {
            if (is_procedure_task(new_task, this.world_model)) {
              const procedure_results = execute_procedure(
                new_task, this.world_model, this.procedure_handlers,
                scope_bindings
              );
              for (const proc_result_task of procedure_results) {
                proc_result_task.stamp = {
                  timestamp: Date.now() / 1000,
                  parent_ids: [new_task.id],
                  schema_id: schema.id,
                  scope_bindings: scope_bindings,
                };
                this.agenda.push(proc_result_task);
              }
            } else {
              if (new_task.type === TaskType.BELIEF) {
                new_task.truth = this.truth_policy.derivation(
                  task_a, task_b, schema.id
                );
              }
              new_task.attention = this.attention_policy.calculate_derived(
                task_a, task_b, schema.id
              );
              new_task.stamp = {
                timestamp: Date.now() / 1000,
                parent_ids: [task_a.id, task_b.id],
                schema_id: schema.id,
                scope_bindings: scope_bindings,
              };
              this.agenda.push(new_task);
            }
          }
        }
      }
    }

    if (task_a.type === TaskType.BELIEF) {
      this.world_model.add_task(task_a);
    }
  }

  private get_time_ago(timestamp: number): string {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private get_retention_time(durability: number): string {
    // Placeholder: A simple mapping from durability to a human-readable retention time
    if (durability > 0.8) return 'Long';
    if (durability > 0.5) return 'Medium';
    return 'Short';
  }

  private get_priority_text(priority: number): string {
    if (priority > 0.75) return 'HIGH';
    if (priority > 0.5) return 'MEDIUM';
    return 'LOW';
  }

  private map_task_to_gui_task(task: Task): GuiTask {
    const atom = this.world_model.get_atom(task.atom_id);
    const guiTask: GuiTask = {
      ...task,
      content: atom ? atom.content : 'Atom not found',
      priority_text: this.get_priority_text(task.attention.priority),
      created_ago: this.get_time_ago(task.stamp.timestamp),
      retains_for: this.get_retention_time(task.attention.durability),
      related_to: task.stamp.parent_ids.length > 0 
        ? `Related to: ${task.stamp.parent_ids.map(id => {
            try {
              return this.world_model.get_atom(this.world_model.get_task(id).atom_id).content;
            } catch (e) {
              console.error(`Error fetching related task atom content for ID ${id}:`, e);
              return 'Unknown';
            }
          }).join(', ')}`
        : undefined,
      path_history: task.stamp.parent_ids.length > 0 
        ? `Path: ${task.stamp.parent_ids.map(id => {
            try {
              return this.world_model.get_atom(this.world_model.get_task(id).atom_id).content;
            } catch (e) {
              console.error(`Error fetching path history task atom content for ID ${id}:`, e);
              return 'Unknown';
            }
          }).join(' → ')}`
        : undefined,
      source: task.stamp.schema_id 
        ? (this.schema_registry.get(task.stamp.schema_id)?.get_trigger_pattern() || `Schema ID: ${task.stamp.schema_id}`)
        : undefined,
      completed_ago: task.type === TaskType.BELIEF ? this.get_time_ago(task.stamp.timestamp) : undefined,
      verification_status: task.type === TaskType.BELIEF ? 'Unverified' : undefined, // Placeholder
      knowledge_retention: task.type === TaskType.BELIEF ? this.get_retention_time(task.attention.durability) : undefined,
    };

    // Special handling for 'next_step' for PROCEDURE tasks
    if (task.type === TaskType.GOAL && is_procedure_task(task, this.world_model)) {
      const handler_name = extract_handler_name(atom.content);
      const query = extract_param(atom.content, "query");
      guiTask.next_step = `Research toxicity (${handler_name} query: "${query || 'N/A'}")`;
    }

    return guiTask;
  }

  public get_active_thoughts(): GuiTask[] {
    return this.agenda['items'].map(item => this.map_task_to_gui_task(item.task));
  }

  public get_completed_thoughts(): GuiTask[] {
    return Array.from(this.world_model.tasks.values())
      .filter(task => task.type === TaskType.BELIEF) // Only show beliefs as completed thoughts
      .map(t => this.map_task_to_gui_task(t));
  }

  public get_cognitive_metrics() {
    const activeTasks = this.agenda.size();
    const completedBeliefs = Array.from(this.world_model.tasks.values()).filter(task => task.type === TaskType.BELIEF).length;
    const totalTasks = activeTasks + completedBeliefs;

    // Placeholder for actual focus, memory, energy calculations
    const focusLevel = totalTasks > 0 ? ((activeTasks / totalTasks) * 100).toFixed(0) : 0;
    const memoryItems = completedBeliefs;
    const energyLevel = 78; // Static for now

    return {
      focus: `${focusLevel}%`, 
      active_thoughts: activeTasks,
      memory: `${memoryItems} items`,
      energy: `${energyLevel}%`,
    };
  }

  public add_new_thought(content: string, type: TaskType = TaskType.GOAL) {
    const atom: SemanticAtom = {
      id: uuidv4(),
      content: content,
      embedding: [], // Placeholder
    };
    this.world_model.add_atom(atom);

    const newTask: Task = {
      id: uuidv4(),
      atom_id: atom.id,
      type: type,
      attention: this.attention_policy.calculate_initial({} as Task), // Placeholder task for initial calculation
      stamp: { timestamp: Date.now() / 1000, parent_ids: [], schema_id: uuidv4() },
    };

    if (type === TaskType.BELIEF) {
      newTask.truth = { frequency: 0.7, confidence: 0.7 }; // Default truth for new beliefs
    }

    this.agenda.push(newTask);
    console.log(`Added new thought: "${content}" as ${type}`);
  }
}
