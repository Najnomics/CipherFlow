import { describe, expect, it, vi } from "vitest";
import { zeroAddress, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

import type { ProfitReport, QuoteLeg, SwapIntentDefinition } from "@cipherflow/markets";
import { ExecutionService } from "../src/executionService.js";

const mockIntent: SwapIntentDefinition = {
  intentId: 1n,
  fromToken: zeroAddress,
  toToken: zeroAddress,
  amountIn: 1_000_000_000_000_000_000n,
  minAmountOut: 900_000_000_000_000_000n,
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
  context: {},
};

const mockReport: ProfitReport = {
  venue: mockLeg.venue,
  amountOut: mockLeg.expectedAmountOut,
  amountIn: mockIntent.amountIn,
  gasCost: mockLeg.gasEstimate * 25n * 10n ** 9n,
  bridgeFee: 0n,
  netProfit: mockLeg.expectedAmountOut - mockIntent.amountIn,
  quoteIssuedAt: Date.now(),
  warnings: [],
};

describe("ExecutionService", () => {
  it("logs execution attempts when RPC is missing", async () => {
    const logger = vi.fn();
    const service = new ExecutionService({
      chainId: baseSepolia.id,
      logger,
    });

    await service.execute(mockIntent, mockReport, mockLeg);

    expect(logger).toHaveBeenCalledWith("[executor] preparing execution", expect.any(Object));
    expect(logger).toHaveBeenCalledWith("[executor] no RPC client configured; skipping broadcast", {});
  });
});

