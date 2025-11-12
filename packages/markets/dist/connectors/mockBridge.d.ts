import type { QuoteConnector } from "./base.js";
import type { QuoteRequest, QuoteResult, LiquidityVenue } from "../types.js";
export interface MockBridgeConfig {
    destinationVenue: LiquidityVenue;
    chainId: number;
    expectedAmountOut: string;
    gasEstimate: string;
    bridgeFee?: string;
    context?: Record<string, unknown>;
}
export interface MockBridgeConnectorOptions {
    config: MockBridgeConfig[];
}
export declare class MockBridgeConnector implements QuoteConnector {
    readonly venue = "mock-bridge";
    private readonly routes;
    constructor(options: MockBridgeConnectorOptions);
    supportedChains(): number[];
    getQuote(request: QuoteRequest): Promise<QuoteResult | null>;
}
