import { z } from "zod";

import type { QuoteRequest, QuoteResult, LiquidityVenue } from "../types.js";

export interface QuoteConnector {
  readonly venue: LiquidityVenue;
  supportedChains(): number[];
  getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}

export type ConnectorMap = Record<LiquidityVenue, QuoteConnector>;

export const quoteRequestSchema = z.object({
  chainId: z.number().int().positive(),
  fromToken: z.string(),
  toToken: z.string(),
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

