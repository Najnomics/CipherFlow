import { zeroAddress, type Address, type Hex } from "viem";

import type { QuoteConnector } from "./base.js";
import { parseQuoteRequest } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";

const SUPPORTED_CHAINS = [84532, 8453]; // Base Sepolia, Base Mainnet

export class AerodromeConnector implements QuoteConnector {
  readonly venue = "aerodrome";

  supportedChains(): number[] {
    return SUPPORTED_CHAINS;
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    const parsed = parseQuoteRequest(request);
    if (!SUPPORTED_CHAINS.includes(parsed.chainId)) {
      return null;
    }

    const expectedAmountOut = parsed.amountIn; // TODO: replace with actual pool simulation
    const callData = "0x" as Hex;
    const router = zeroAddress as Address;

    return {
      leg: {
        venue: this.venue,
        chainId: parsed.chainId,
        expectedAmountOut,
        gasEstimate: 150_000n,
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

