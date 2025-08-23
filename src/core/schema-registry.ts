import { UUID } from './types';
import { ICognitiveSchema } from './interfaces';

export class SchemaRegistry {
  private static instance: SchemaRegistry;
  private schemas: Record<UUID, ICognitiveSchema> = {};

  private constructor() {}

  public static getInstance(): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry();
    }
    return SchemaRegistry.instance;
  }

  register(schema: ICognitiveSchema): void {
    this.schemas[schema.id] = schema;
  }

  get(schema_id: UUID): ICognitiveSchema | undefined {
    return this.schemas[schema_id];
  }

  get_all(): ICognitiveSchema[] {
    return Object.values(this.schemas);
  }
}
