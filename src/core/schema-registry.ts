import { UUID } from './types';
import { ICognitiveSchema, PatternMatcher } from './interfaces';

export class SchemaRegistry {
  private schemas: Record<UUID, ICognitiveSchema> = {};
  private pattern_matcher: PatternMatcher;

  constructor(pattern_matcher: PatternMatcher) {
    this.pattern_matcher = pattern_matcher;
  }

  register(schema: ICognitiveSchema): void {
    if (this.schemas[schema.id]) {
        console.warn(`Schema with ID ${schema.id} is already registered.`);
        return;
    }
    this.schemas[schema.id] = schema;
    this.pattern_matcher.add(schema.get_trigger_pattern(), schema.id);
  }

  get(schema_id: UUID): ICognitiveSchema | undefined {
    return this.schemas[schema_id];
  }

  get_all(): ICognitiveSchema[] {
    return Object.values(this.schemas);
  }
}
