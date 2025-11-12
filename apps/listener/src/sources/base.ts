import { fetch } from "undici";
import { z } from "zod";

import { normalizedIntentSchema, type NormalizedIntent, type IntentSource } from "../types.js";

export abstract class HttpIntentSource implements IntentSource {
  abstract readonly name: NormalizedIntent["source"];
  protected abstract endpoint: string | undefined;
  protected abstract transform(response: unknown): Promise<NormalizedIntent[]>;

  async pullIntents(): Promise<NormalizedIntent[]> {
    if (!this.endpoint) {
      return [];
    }

    try {
      const res = await fetch(this.endpoint);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const body = await res.json();
      const intents = await this.transform(body);
      return intents.map((intent) => normalizedIntentSchema.parse(intent));
    } catch (error) {
      if (process.env.DEBUG_LISTENER === "1") {
        console.error(`[listener] ${this.name} source error`, error);
      }
      return [];
    }
  }
}

export const bigintFromDecimalString = (value: string | number): bigint => {
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
};

export const rawCowIntentSchema = z.object({
  uid: z.string(),
  owner: z.string(),
  sellToken: z.string(),
  buyToken: z.string(),
  sellAmount: z.string(),
  buyAmount: z.string(),
  validTo: z.number().optional(),
  appData: z.string().optional(),
});

export const rawOneInchIntentSchema = z.object({
  requestId: z.string(),
  maker: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.string(),
  minReturnAmount: z.string(),
  metadata: z.record(z.any()).optional(),
});

