import { zeroAddress } from "viem";
import { parseQuoteRequest } from "./base.js";
const SUPPORTED_CHAINS = [1, 10, 42161, 8453, 84532];
export class UniswapConnector {
    venue = "uniswap";
    supportedChains() {
        return SUPPORTED_CHAINS;
    }
    async getQuote(request) {
        const parsed = parseQuoteRequest(request);
        if (!SUPPORTED_CHAINS.includes(parsed.chainId)) {
            return null;
        }
        const expectedAmountOut = (parsed.amountIn * 995n) / 1000n; // assume 0.5% fee for stub
        const callData = "0x";
        const router = zeroAddress;
        return {
            leg: {
                venue: this.venue,
                chainId: parsed.chainId,
                expectedAmountOut,
                gasEstimate: 180000n,
                target: router,
                callData,
                bridgeFee: 0n,
                context: { note: "stubbed uniswap quote" },
            },
            quoteTimestamp: Date.now(),
            warnings: ["Uniswap connector returns stub data"],
        };
    }
}
