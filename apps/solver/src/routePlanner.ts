import {
  createDefaultConnectors,
  type QuoteConnector,
  type QuoteResult,
  type SwapIntentDefinition,
  type ProfitReport,
} from "@cipherflow/markets";

export interface RoutePlannerOptions {
  connectors?: QuoteConnector[];
  gasPriceWei?: bigint;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

const DEFAULT_GAS_PRICE_WEI = 25n * 10n ** 9n; // 25 gwei

export class RoutePlanner {
  private readonly connectors: QuoteConnector[];
  private readonly gasPriceWei: bigint;
  private readonly log?: RoutePlannerOptions["logger"];

  constructor(options: RoutePlannerOptions = {}) {
    this.connectors = options.connectors ?? createDefaultConnectors();
    this.gasPriceWei = options.gasPriceWei ?? DEFAULT_GAS_PRICE_WEI;
    this.log = options.logger;
  }

  async planBestRoute(intent: SwapIntentDefinition): Promise<ProfitReport | null> {
    const quotes = await this.collectQuotes(intent);
    if (quotes.length === 0) {
      this.log?.("[route-planner] no quotes available", { intentId: intent.intentId.toString() });
      return null;
    }

    const best = quotes.reduce<{ quote: QuoteResult; connector: QuoteConnector }>((top, candidate) => {
      const topNet = this.calculateNetAmount(top.quote.leg, intent.amountIn);
      const candidateNet = this.calculateNetAmount(candidate.quote.leg, intent.amountIn);

      if (candidateNet > topNet) {
        return candidate;
      }
      if (candidateNet === topNet) {
        return candidate.quote.leg.gasEstimate < top.quote.leg.gasEstimate ? candidate : top;
      }
      return top;
    }, quotes[0]);

    const gasCost = best.quote.leg.gasEstimate * this.gasPriceWei;
    const bridgeFee = best.quote.leg.bridgeFee ?? 0n;
    const netProfit = best.quote.leg.expectedAmountOut - intent.amountIn - gasCost - bridgeFee;

    const report: ProfitReport = {
      venue: best.quote.leg.venue,
      amountOut: best.quote.leg.expectedAmountOut,
      amountIn: intent.amountIn,
      gasCost,
      bridgeFee,
      netProfit,
      quoteIssuedAt: best.quote.quoteTimestamp,
      warnings: best.quote.warnings,
    };

    this.log?.("[route-planner] selected route", {
      intentId: intent.intentId.toString(),
      venue: report.venue,
      netProfit: report.netProfit.toString(),
    });

    return report;
  }

  private calculateNetAmount(leg: QuoteResult["leg"], amountIn: bigint): bigint {
    const bridgeFee = leg.bridgeFee ?? 0n;
    return leg.expectedAmountOut - bridgeFee - amountIn;
  }

  private async collectQuotes(intent: SwapIntentDefinition): Promise<Array<{ connector: QuoteConnector; quote: QuoteResult }>> {
    const request = {
      chainId: intent.destinationChainId ?? intent.sourceChainId,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amountIn: intent.amountIn,
      deadline: intent.metadata?.deadline as number | undefined,
      destinationChainId: intent.destinationChainId,
    };

    const results = await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          const quote = await connector.getQuote(request);
          return quote ? { connector, quote } : null;
        } catch (error) {
          this.log?.("[route-planner] connector error", {
            venue: connector.venue,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }),
    );

    return results.filter((entry): entry is { connector: QuoteConnector; quote: QuoteResult } => entry !== null);
  }
}

