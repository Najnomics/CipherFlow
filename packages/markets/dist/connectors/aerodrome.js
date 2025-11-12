import { zeroAddress } from "viem";
import { parseQuoteRequest } from "./base.js";
const SUPPORTED_CHAINS = [84532, 8453]; // Base Sepolia, Base Mainnet
export class AerodromeConnector {
    venue = "aerodrome";
    supportedChains() {
        return SUPPORTED_CHAINS;
    }
    async getQuote(request) {
        const parsed = parseQuoteRequest(request);
        if (!SUPPORTED_CHAINS.includes(parsed.chainId)) {
            return null;
        }
        const expectedAmountOut = parsed.amountIn; // TODO: replace with actual pool simulation
        const callData = "0x";
        const router = zeroAddress;
        return {
            leg: {
                venue: this.venue,
                chainId: parsed.chainId,
                expectedAmountOut,
                gasEstimate: 150000n,
                target: router,
                callData,
                bridgeFee: 0n,
                context: { note: "stubbed aerodrome quote" },
            },
            quoteTimestamp: Date.now(),
            warnings: ["Aerodrome connector returns stub data"],
        };
    }
}
