import { zeroAddress, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

import type { ProfitReport, QuoteLeg, SwapIntentDefinition } from "@cipherflow/markets";
import { ExecutionService } from "./executionService.js";

const envSchema = z.object({
  RPC_URL: z.string().url().optional(),
  CHAIN_ID: z.coerce.number().int().positive().optional(),
});

const env = envSchema.parse(process.env);

const executionService = new ExecutionService({
  rpcUrl: env.RPC_URL,
  chainId: env.CHAIN_ID ?? baseSepolia.id,
  logger: (message, meta) => {
    if (meta) {
      console.log(message, meta);
      return;
    }
    console.log(message);
  },
});

async function main() {
  console.log("[executor] booting", { rpcUrl: env.RPC_URL ?? "<not set>" });

  const mockIntent: SwapIntentDefinition = {
    intentId: 1n,
    fromToken: zeroAddress,
    toToken: zeroAddress,
    amountIn: 1_000_000_000_000_000_000n,
    minAmountOut: 950_000_000_000_000_000n,
    sourceChainId: baseSepolia.id,
    metadata: {},
  };

  const mockLeg: QuoteLeg = {
    venue: "aerodrome",
    chainId: baseSepolia.id,
    expectedAmountOut: 1_020_000_000_000_000_000n,
    gasEstimate: 150_000n,
    target: zeroAddress,
    callData: "0x" as Hex,
    bridgeFee: 0n,
    context: { note: "stub execution leg" },
  };

  const mockReport: ProfitReport = {
    venue: mockLeg.venue,
    amountOut: mockLeg.expectedAmountOut,
    amountIn: mockIntent.amountIn,
    gasCost: mockLeg.gasEstimate * 25n * 10n ** 9n,
    bridgeFee: mockLeg.bridgeFee ?? 0n,
    netProfit: mockLeg.expectedAmountOut - mockIntent.amountIn,
    quoteIssuedAt: Date.now(),
    warnings: [],
  };

  await executionService.execute(mockIntent, mockReport, mockLeg);
}

void main();
