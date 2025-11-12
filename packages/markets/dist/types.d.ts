import type { Address, Hex } from "viem";
export type ChainId = number;
export type LiquidityVenue = "aerodrome" | "uniswap" | "curve";
export interface QuoteRequest {
    chainId: ChainId;
    fromToken: Address;
    toToken: Address;
    amountIn: bigint;
    /** Optional max slippage in basis points (100 = 1%) */
    slippageBps?: number;
    /**
     * Absolute unix timestamp (seconds) by which the route must be
     * executed. Connectors may return `null` if they cannot satisfy.
     */
    deadline?: number;
    /**
     * Optional hint if the trade needs to bridge to another chain.
     * When omitted, connectors assume same-chain execution.
     */
    destinationChainId?: ChainId;
}
export interface QuoteLeg {
    venue: LiquidityVenue;
    chainId: ChainId;
    expectedAmountOut: bigint;
    gasEstimate: bigint;
    /**
     * Destination contract that should be called to realise the route.
     * Implementations will provide a concrete router/pool address.
     */
    target: Address;
    /**
     * Prepared calldata suitable for inclusion in a transaction submitted
     * by the solver. The executor is expected to treat this as opaque.
     */
    callData: Hex;
    /**
     * Optional bridge fee denominated in the input asset. When present,
     * the solver should subtract it from the final profitability score.
     */
    bridgeFee?: bigint;
    /**
     * Arbitrary metadata forwarded to the executor (e.g. path breakdown).
     */
    context?: Record<string, unknown>;
}
export interface QuoteResult {
    leg: QuoteLeg;
    quoteTimestamp: number;
    /**
     * Zero or more warnings (e.g. stale pool data, simulated revert).
     */
    warnings: string[];
}
export interface SwapIntentDefinition {
    intentId: bigint;
    commitmentId?: bigint;
    fromToken: Address;
    toToken: Address;
    amountIn: bigint;
    minAmountOut: bigint;
    sourceChainId: ChainId;
    destinationChainId?: ChainId;
    /**
     * Arbitrary metadata pulled from `IntentHub.extraData`, decoded by the
     * solver for venue selection heuristics.
     */
    metadata?: Record<string, unknown>;
}
export interface ProfitReport {
    venue: LiquidityVenue;
    amountOut: bigint;
    amountIn: bigint;
    gasCost: bigint;
    bridgeFee: bigint;
    netProfit: bigint;
    quoteIssuedAt: number;
    warnings: string[];
}
