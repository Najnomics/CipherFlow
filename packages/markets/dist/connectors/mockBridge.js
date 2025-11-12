import { parseQuoteRequest } from "./base.js";
export class MockBridgeConnector {
    venue = "mock-bridge";
    routes;
    constructor(options) {
        this.routes = new Map(options.config.map((cfg) => [cfg.chainId, cfg]));
    }
    supportedChains() {
        return [...this.routes.keys()];
    }
    async getQuote(request) {
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
