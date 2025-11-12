import { z } from "zod";
import type { Address } from "viem";

import type { QuoteRequest, QuoteResult, LiquidityVenue } from "../types.js";

export interface QuoteConnector {
  readonly venue: LiquidityVenue;
  supportedChains(): number[];
  getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}

export type ConnectorMap = Record<LiquidityVenue, QuoteConnector>;

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/) as unknown as z.ZodType<Address>;

export const quoteRequestSchema = z.object({
  chainId: z.number().int().positive(),
  fromToken: addressSchema,
  toToken: addressSchema,
  amountIn: z.bigint().positive(),
  slippageBps: z.number().int().positive().max(10_000).optional(),
  deadline: z.number().int().positive().optional(),
  destinationChainId: z.number().int().positive().optional(),
});

/**
 * Helper that runs JSON-schema style validation before handing a request
 * to a connector. Connectors should call this to ensure well-formed input.
 */
export function parseQuoteRequest(request: QuoteRequest): QuoteRequest {
  return quoteRequestSchema.parse(request);
}

export function sortQuotesDescending(quotes: QuoteResult[]): QuoteResult[] {
  return [...quotes].sort((a, b) => {
    if (a.leg.expectedAmountOut === b.leg.expectedAmountOut) {
      return Number(b.leg.gasEstimate - a.leg.gasEstimate);
    }
    return a.leg.expectedAmountOut > b.leg.expectedAmountOut ? -1 : 1;
  });
}

export const bigintFromDecimalString = (value: string | number): bigint => {
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  if (value.includes(".")) {
    const [whole] = value.split(".");
    return BigInt(whole);
  }
  return BigInt(value);
};


