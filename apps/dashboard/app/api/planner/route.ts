import { NextResponse } from "next/server";
import {
  createDefaultConnectors,
  type QuoteConnector,
  type QuoteResult,
} from "@cipherflow/markets";
import { zeroAddress } from "viem";

const connectors = createDefaultConnectors({
  mockBridge: process.env.MOCK_BRIDGE_CONFIG
    ? JSON.parse(process.env.MOCK_BRIDGE_CONFIG)
    : undefined,
});

const GAS_PRICE_WEI = BigInt(process.env.GAS_PRICE_GWEI ?? 25) * 10n ** 9n;
const AMOUNT_IN = 1_000_000_000_000_000_000n;

async function collectQuotes(): Promise<Array<{ quote: QuoteResult; connector: QuoteConnector }>> {
  const intent = {
    chainId: 84532,
    fromToken: zeroAddress,
    toToken: zeroAddress,
    amountIn: AMOUNT_IN,
  };

  const results = await Promise.all(
    connectors.map(async (connector) => {
      try {
        const quote = await connector.getQuote({
          chainId: intent.chainId,
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amountIn: intent.amountIn,
          destinationChainId: intent.chainId,
        });
        return quote ? { connector, quote } : null;
      } catch (error) {
        console.error("planner error", connector.venue, error);
        return null;
      }
    }),
  );

  return results.filter((entry): entry is { connector: QuoteConnector; quote: QuoteResult } => entry !== null);
}

function netAmountOut(quote: QuoteResult): bigint {
  const bridgeFee = quote.leg.bridgeFee ?? 0n;
  const gas = quote.leg.gasEstimate * GAS_PRICE_WEI;
  return quote.leg.expectedAmountOut - bridgeFee - gas;
}

export async function GET() {
  const quotes = await collectQuotes();

  if (!quotes.length) {
    return NextResponse.json({
      intent: {
        intentId: "1",
      },
      report: null,
    });
  }

  const best = quotes.reduce((top, candidate) => {
    const topNet = netAmountOut(top.quote);
    const candidateNet = netAmountOut(candidate.quote);

    if (candidateNet > topNet) {
      return candidate;
    }
    if (candidateNet === topNet) {
      return candidate.quote.leg.gasEstimate < top.quote.leg.gasEstimate ? candidate : top;
    }
    return top;
  }, quotes[0]);

  const bridgeFee = best.quote.leg.bridgeFee ?? 0n;
  const gasCost = best.quote.leg.gasEstimate * GAS_PRICE_WEI;
  const netProfit = best.quote.leg.expectedAmountOut - AMOUNT_IN - bridgeFee - gasCost;

  return NextResponse.json({
    intent: {
      intentId: "1",
    },
    report: {
      venue: best.quote.leg.venue,
      amountOut: best.quote.leg.expectedAmountOut.toString(),
      amountIn: AMOUNT_IN.toString(),
      gasCost: gasCost.toString(),
      bridgeFee: bridgeFee.toString(),
      netProfit: netProfit.toString(),
      quoteIssuedAt: best.quote.quoteTimestamp,
      warnings: best.quote.warnings,
    },
  });
}

