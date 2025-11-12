import { zeroAddress } from "viem";
import { z } from "zod";

import { createDefaultConnectors, type SwapIntentDefinition } from "@cipherflow/markets";
import { RoutePlanner } from "./routePlanner.js";

const envSchema = z.object({
  LISTENER_URL: z.string().url().optional(),
  GAS_PRICE_GWEI: z.coerce.number().positive().optional(),
  AERODROME_API_URL: z.string().url().optional(),
  UNISWAP_API_URL: z.string().url().optional(),
  CURVE_API_URL: z.string().url().optional(),
});

const env = envSchema.parse(process.env);

const gasPriceWei = env.GAS_PRICE_GWEI ? BigInt(Math.round(env.GAS_PRICE_GWEI * 1e9)) : undefined;

const routePlanner = new RoutePlanner({
  connectors: createDefaultConnectors({
    aerodrome: { apiUrl: env.AERODROME_API_URL },
    uniswap: { apiUrl: env.UNISWAP_API_URL },
    curve: { apiUrl: env.CURVE_API_URL },
  }),
  gasPriceWei,
  logger: (message, meta) => {
    if (meta) {
      console.log(message, meta);
      return;
    }
    console.log(message);
  },
});

async function main() {
  console.log("[solver] booting with listener", env.LISTENER_URL ?? "<not set>");

  const mockIntent: SwapIntentDefinition = {
    intentId: 1n,
    fromToken: zeroAddress,
    toToken: zeroAddress,
    amountIn: 1_000_000_000_000_000_000n, // 1.0 tokens
    minAmountOut: 950_000_000_000_000_000n,
    sourceChainId: 84532,
    metadata: { deadline: Math.floor(Date.now() / 1000) + 600 },
  };

  const report = await routePlanner.planBestRoute(mockIntent);
  if (!report) {
    console.log("[solver] no profitable routes discovered for mock intent");
    return;
  }

  console.log("[solver] best route", {
    venue: report.venue,
    amountOut: report.amountOut.toString(),
    netProfit: report.netProfit.toString(),
  });
}

void main();
