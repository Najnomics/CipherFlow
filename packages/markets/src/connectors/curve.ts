import { fetch } from "undici";
import { zeroAddress, type Address, type Hex } from "viem";
import { z } from "zod";

import type { QuoteConnector } from "./base.js";
import { bigintFromDecimalString, parseQuoteRequest } from "./base.js";
import type { QuoteRequest, QuoteResult } from "../types.js";

const SUPPORTED_CHAINS = [1, 10, 137, 42161, 8453, 84532];

const quoteResponseSchema = z.object({
  amountOut: z.string(),
  target: z.string().optional(),
  callData: z.string().optional(),
  gasEstimate: z.string().optional(),
  bridgeFee: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export interface CurveConnectorOptions {
  apiUrl?: string;
}

export class CurveConnector implements QuoteConnector {
  readonly venue = "curve";
  private readonly options: CurveConnectorOptions;

  constructor(options: CurveConnectorOptions = {}) {
    this.options = options;
  }

  supportedChains(): number[] {
    return SUPPORTED_CHAINS;
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    const parsed = parseQuoteRequest(request);
    if (!SUPPORTED_CHAINS.includes(parsed.chainId)) {
      return null;
    }

    if (this.options.apiUrl) {
      const url = new URL(this.options.apiUrl);
      url.searchParams.set("chainId", parsed.chainId.toString());
      url.searchParams.set("fromToken", parsed.fromToken);
      url.searchParams.set("toToken", parsed.toToken);
      url.searchParams.set("amount", parsed.amountIn.toString());

      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = quoteResponseSchema.parse(await res.json());
        const expectedAmountOut = bigintFromDecimalString(data.amountOut);
        const target = (data.target ?? zeroAddress) as Address;
        const callData = (data.callData ?? "0x") as Hex;
        const gasEstimate = data.gasEstimate ? bigintFromDecimalString(data.gasEstimate) : 220_000n;
        const bridgeFee = data.bridgeFee ? bigintFromDecimalString(data.bridgeFee) : 0n;

        return {
          leg: {
            venue: this.venue,
            chainId: parsed.chainId,
            expectedAmountOut,
            gasEstimate,
            target,
            callData,
            bridgeFee,
            context: { api: "curve" },
          },
          quoteTimestamp: Date.now(),
          warnings: data.warnings ?? [],
        };
      } catch (error) {
        if (process.env.DEBUG_MARKETS === "1") {
          console.error("[markets] curve quote error", error);
        }
      }
    }

    const expectedAmountOut = (parsed.amountIn * 997n) / 1000n;
    const callData = "0x" as Hex;
    const router = zeroAddress as Address;

    return {
      leg: {
        venue: this.venue,
        chainId: parsed.chainId,
        expectedAmountOut,
        gasEstimate: 210_000n,
        target: router,
        callData,
        bridgeFee: 0n,
        context: { note: "stubbed curve quote" },
      },
      quoteTimestamp: Date.now(),
      warnings: ["Curve connector returns stub data"],
    };
  }
}

