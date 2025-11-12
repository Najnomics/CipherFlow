import { describe, expect, it } from "vitest";

import { RoutePlanner } from "../src/routePlanner.js";
import type { SwapIntentDefinition } from "@cipherflow/markets";
import { zeroAddress } from "viem";

describe("RoutePlanner", () => {
  it("returns a profit report with stubbed connectors", async () => {
    const planner = new RoutePlanner();

    const mockIntent: SwapIntentDefinition = {
      intentId: 1n,
      fromToken: zeroAddress,
      toToken: zeroAddress,
      amountIn: 1_000_000_000_000_000_000n,
      minAmountOut: 900_000_000_000_000_000n,
      sourceChainId: 84532,
      metadata: {},
    };

    const report = await planner.planBestRoute(mockIntent);

    expect(report).toBeTruthy();
    expect(report?.amountOut).toBeGreaterThan(mockIntent.amountIn - report!.gasCost);
  });
});

