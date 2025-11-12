import { zeroAddress, type Address, type Hex } from "viem";

import type { QuoteConnector } from "./base.js";
import { parseQuoteRequest } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";

const SUPPORTED_CHAINS = [1, 10, 42161, 8453, 84532];

export class UniswapConnector implements QuoteConnector {
  readonly venue = "uniswap";

  supportedChains(): number[] {
    return SUPPORTED_CHAINS;
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    const parsed = parseQuoteRequest(request);
    if (!SUPPORTED_CHAINS.includes(parsed.chainId)) {
      return null;
    }

    const expectedAmountOut = (parsed.amountIn * 995n) / 1000n; // assume 0.5% fee for stub
    const callData = "0x" as Hex;
    const router = zeroAddress as Address;

    return {
      leg: {
        venue: this.venue,
        chainId: parsed.chainId,
        expectedAmountOut,
        gasEstimate: 180_000n,
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

