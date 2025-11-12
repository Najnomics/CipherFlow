import { z } from "zod";
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
export function parseQuoteRequest(request) {
    return quoteRequestSchema.parse(request);
}
export function sortQuotesDescending(quotes) {
    return [...quotes].sort((a, b) => {
        if (a.leg.expectedAmountOut === b.leg.expectedAmountOut) {
            return Number(b.leg.gasEstimate - a.leg.gasEstimate);
        }
        return a.leg.expectedAmountOut > b.leg.expectedAmountOut ? -1 : 1;
    });
}
