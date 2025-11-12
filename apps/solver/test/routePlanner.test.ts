import { describe, expect, it } from "vitest";

import { RoutePlanner } from "../src/routePlanner.js";
import type { SwapIntentDefinition, QuoteConnector } from "@cipherflow/markets";
import { MockBridgeConnector } from "@cipherflow/markets";
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

  it("prefers mock bridge connector when configured", async () => {
    const mockConnector: QuoteConnector = new MockBridgeConnector({
      config: [
        {
          destinationVenue: "mock-bridge",
          chainId: 84532,
          expectedAmountOut: (1_200_000_000_000_000_000n).toString(),
          gasEstimate: (100_000n).toString(),
          bridgeFee: "0",
          context: { note: "bridge" },
        },
      ],
    });

    const planner = new RoutePlanner({ connectors: [mockConnector] });

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
    expect(report?.venue).toBe("mock-bridge");
    expect(report?.netProfit).toBeGreaterThan(0n);
  });
});

