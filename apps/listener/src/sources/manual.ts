import { HttpIntentSource } from "./base.js";
import { normalizedIntentSchema, type NormalizedIntent } from "../types.js";

export class ManualSource extends HttpIntentSource {
  readonly name = "manual";
  protected endpoint: string | undefined;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint;
  }

  protected async transform(response: unknown): Promise<NormalizedIntent[]> {
    if (!response) return [];
    const intents = Array.isArray(response) ? response : (response as { intents?: unknown[] }).intents ?? [];
    return intents.map((intent) => normalizedIntentSchema.parse({ ...intent, source: this.name }));
  }
}

