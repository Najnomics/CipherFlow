import type { QuoteConnector } from "./base.js";
import { parseQuoteRequest } from "./base.js";
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

export class MockBridgeConnector implements QuoteConnector {
  readonly venue = "mock-bridge";
  private readonly routes: Map<number, MockBridgeConfig>;

  constructor(options: MockBridgeConnectorOptions) {
    this.routes = new Map(options.config.map((cfg) => [cfg.chainId, cfg]));
  }

  supportedChains(): number[] {
    return [...this.routes.keys()];
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    const parsed = parseQuoteRequest(request);
    const route = this.routes.get(parsed.chainId);
    if (!route) {
      return null;
    }

    const expectedAmountOut = BigInt(route.expectedAmountOut);
    const gasEstimate = BigInt(route.gasEstimate);
    const bridgeFee = route.bridgeFee ? BigInt(route.bridgeFee) : 0n;

    return {
      leg: {
        venue: route.destinationVenue,
        chainId: parsed.chainId,
        expectedAmountOut,
        gasEstimate,
        target: parsed.toToken,
        callData: "0x",
        bridgeFee,
        context: route.context ?? {},
      },
      quoteTimestamp: Date.now(),
      warnings: ["Using mock bridge connector"],
    };
  }
}

