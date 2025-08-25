import { v4 as uuidv4 } from 'uuid';
import { generate_embedding } from './core/utils';
import { WorldModel } from './core/world-model';
import { EventBus } from './gui/EventBus';
import { DefaultAttentionPolicy, DefaultTruthPolicy, DefaultResonanceStrategy, LLMHandler, InMemoryPatternMatcher, QuestionGeneratorHandler } from './core/implementations';
import { Task, SemanticAtom } from './core/models';
import { TaskType } from './core/types';
import { ProcedureHandler } from './core/interfaces';
import { Agenda } from './core/agenda';
import { SchemaRegistry } from './core/schema-registry';
import { DeductionSchema } from './core/schemas';
import { AbductionSchema } from './core/schemas/abduction';
import { InductionSchema } from './core/schemas/induction';
import { SafetyAnalysisSchema } from './core/schemas/safety_analysis';
import { SelfSafetySchema } from './core/schemas/self_safety';
import { ThoughtExpansionSchema } from './core/schemas/thought_expansion';
import { seed_data } from './core/seed';
import { CognitiveEngine } from './core/engine'; // Import the new engine
import { loadConfig, Config, LLMConfig } from './core/config';

export class App {
  world_model: WorldModel;
  agenda: Agenda;
  schema_registry: SchemaRegistry;
  private attention_policy: DefaultAttentionPolicy;
  private truth_policy: DefaultTruthPolicy;
  private resonance_strategy: DefaultResonanceStrategy;
  private procedure_handlers: Record<string, ProcedureHandler>;
  private engine: CognitiveEngine; // Add the engine instance
  private config: Config;
  private eventBus: EventBus;

  // GUI can access these via getters
  public get last_scope_bindings(): Record<string, string> | undefined {
    return this.engine.last_scope_bindings;
  }
  public get last_scope_task(): Task | undefined {
    return this.engine.last_scope_task;
  }

  public get_config(): Config {
    return this.config;
  }

  public get_attention_policy(): DefaultAttentionPolicy {
    return this.attention_policy;
  }

  public get_event_bus(): EventBus {
    return this.eventBus;
  }

  private constructor(config: Config, seedData: boolean = true) {
    this.config = config;
    this.eventBus = new EventBus();
    this.attention_policy = new DefaultAttentionPolicy();
    this.truth_policy = new DefaultTruthPolicy();
    this.resonance_strategy = new DefaultResonanceStrategy();
    this.agenda = new Agenda(this.eventBus);
    this.procedure_handlers = {};

    // Create the pattern matcher first, as it's a shared dependency
    const pattern_matcher = new InMemoryPatternMatcher();
    this.schema_registry = new SchemaRegistry(pattern_matcher);
    this.world_model = new WorldModel(this.eventBus, this.resonance_strategy, this.truth_policy, this.schema_registry, pattern_matcher);

    const llmHandler = new LLMHandler(this.config.llm, this);
    this.procedure_handlers[llmHandler.name()] = llmHandler;

    const questionGeneratorHandler = new QuestionGeneratorHandler(this, llmHandler);
    this.procedure_handlers[questionGeneratorHandler.name()] = questionGeneratorHandler;

    const inductionSchema = new InductionSchema();

    this.engine = new CognitiveEngine(
      this.world_model,
      this.agenda,
      this.attention_policy,
      this.truth_policy,
      this.procedure_handlers,
      this.schema_registry,
      inductionSchema
    );

    const deductionSchema = new DeductionSchema();
    this.schema_registry.register(deductionSchema);

    const abductionSchema = new AbductionSchema();
    this.schema_registry.register(abductionSchema);

    // The InductionSchema is now handled as a special case by the CognitiveEngine.

    const safetyAnalysisSchema = new SafetyAnalysisSchema();
    this.schema_registry.register(safetyAnalysisSchema);

    // The SelfSafetySchema is a placeholder and is not fully implemented.
    // const selfSafetySchema = new SelfSafetySchema();
    // this.schema_registry.register(selfSafetySchema);

    const thoughtExpansionSchema = new ThoughtExpansionSchema();
    this.schema_registry.register(thoughtExpansionSchema);

    if (seedData) {
      seed_data(this.world_model, this.agenda, this.attention_policy);
    }
  }

  public register_schema(schema: ICognitiveSchema) {
    this.schema_registry.register(schema);
  }

  public unregister_schema(schemaId: UUID) {
    this.schema_registry.unregister(schemaId);
  }

  public get_schema_registry(): SchemaRegistry {
    return this.schema_registry;
  }

  public register_procedure_handler(handler: ProcedureHandler) {
    this.procedure_handlers[handler.name()] = handler;
  }

  public unregister_procedure_handler(handlerName: string) {
    delete this.procedure_handlers[handlerName];
  }

  public get_procedure_handlers(): Record<string, ProcedureHandler> {
    return this.procedure_handlers;
  }

  public static async create(seedData: boolean = true): Promise<App> {
    const config = await loadConfig();
    return new App(config, seedData);
  }

  public update_llm_config(config: LLMConfig) {
    this.config.llm = config;
    const llmHandler = this.procedure_handlers['llm'] as LLMHandler;
    llmHandler?.update_config(config);
  }

  // The app's tick now simply delegates to the engine
  public async tick() {
    await this.agenda.decay(this.attention_policy);
    await this.engine.tick();
  }

}
