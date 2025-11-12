import { z } from "zod";

export const normalizedIntentSchema = z.object({
  externalId: z.string(),
  trader: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  amountIn: z.bigint().positive(),
  minAmountOut: z.bigint().nonnegative(),
  source: z.enum(["cow", "oneinch", "manual"]),
  metadata: z.record(z.any()).default({}),
});

export type NormalizedIntent = z.infer<typeof normalizedIntentSchema>;

export interface IntentSource {
  readonly name: NormalizedIntent["source"];
  pullIntents(): Promise<NormalizedIntent[]>;
}

