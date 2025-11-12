import { HttpIntentSource, rawOneInchIntentSchema, bigintFromDecimalString } from "./base.js";
import type { NormalizedIntent } from "../types.js";

export class OneInchSource extends HttpIntentSource {
  readonly name = "oneinch";
  protected endpoint: string | undefined;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint;
  }

  protected async transform(response: unknown): Promise<NormalizedIntent[]> {
    if (!response) return [];
    const intents = Array.isArray(response) ? response : (response as { intents?: unknown[] }).intents ?? [];
    const parsed = intents.map((intent) => rawOneInchIntentSchema.parse(intent));

    return parsed.map((intent) => ({
      externalId: intent.requestId,
      trader: intent.maker,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amountIn: bigintFromDecimalString(intent.amount),
      minAmountOut: bigintFromDecimalString(intent.minReturnAmount),
      source: this.name,
      metadata: intent.metadata ?? {},
    }));
  }
}

