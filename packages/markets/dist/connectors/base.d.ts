import { z } from "zod";
import type { QuoteRequest, QuoteResult, LiquidityVenue } from "../types.js";
export interface QuoteConnector {
    readonly venue: LiquidityVenue;
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
export type ConnectorMap = Record<LiquidityVenue, QuoteConnector>;
export declare const quoteRequestSchema: z.ZodObject<{
    chainId: z.ZodNumber;
    fromToken: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
    toToken: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
    amountIn: z.ZodBigInt;
    slippageBps: z.ZodOptional<z.ZodNumber>;
    deadline: z.ZodOptional<z.ZodNumber>;
    destinationChainId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    chainId: number;
    fromToken: `0x${string}`;
    toToken: `0x${string}`;
    amountIn: bigint;
    slippageBps?: number | undefined;
    deadline?: number | undefined;
    destinationChainId?: number | undefined;
}, {
    chainId: number;
    fromToken: `0x${string}`;
    toToken: `0x${string}`;
    amountIn: bigint;
    slippageBps?: number | undefined;
    deadline?: number | undefined;
    destinationChainId?: number | undefined;
}>;
/**
 * Helper that runs JSON-schema style validation before handing a request
 * to a connector. Connectors should call this to ensure well-formed input.
 */
export declare function parseQuoteRequest(request: QuoteRequest): QuoteRequest;
export declare function sortQuotesDescending(quotes: QuoteResult[]): QuoteResult[];
export declare const bigintFromDecimalString: (value: string | number) => bigint;
