import { HttpIntentSource, rawCowIntentSchema, bigintFromDecimalString } from "./base.js";
import type { NormalizedIntent } from "../types.js";

export class CowSource extends HttpIntentSource {
  readonly name = "cow";
  protected endpoint: string | undefined;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint;
  }

  protected async transform(response: unknown): Promise<NormalizedIntent[]> {
    if (!response) return [];
    const intents = Array.isArray(response) ? response : (response as { orders?: unknown[] }).orders ?? [];
    const parsed = intents.map((order) => rawCowIntentSchema.parse(order));
    return parsed.map((order) => ({
      externalId: order.uid,
      trader: order.owner,
      fromToken: order.sellToken,
      toToken: order.buyToken,
      amountIn: bigintFromDecimalString(order.sellAmount),
      minAmountOut: bigintFromDecimalString(order.buyAmount),
      source: this.name,
      metadata: {
        validTo: order.validTo,
        appData: order.appData,
      },
    }));
  }
}

