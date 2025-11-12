import { describe, expect, it } from "vitest";

import { IngestionService } from "../src/ingestionService.js";
import { IntentQueue } from "../src/queue.js";
import type { IntentSource, NormalizedIntent } from "../src/types.js";

class StubSource implements IntentSource {
  readonly name: NormalizedIntent["source"];
  private readonly intents: NormalizedIntent[];

  constructor(name: NormalizedIntent["source"], intents: NormalizedIntent[]) {
    this.name = name;
    this.intents = intents;
  }

  async pullIntents(): Promise<NormalizedIntent[]> {
    return this.intents;
  }
}

describe("IngestionService", () => {
  it("deduplicates intents across sources", async () => {
    const queue = new IntentQueue();
    const collected: NormalizedIntent[] = [];
    queue.onIntent((intent) => collected.push(intent));

    const intent: NormalizedIntent = {
      externalId: "order-1",
      trader: "0xtrader",
      fromToken: "ETH",
      toToken: "USDC",
      amountIn: 1_000_000_000_000_000_000n,
      minAmountOut: 1_800_000_000n,
      source: "cow",
      metadata: {},
    };

    const sources: IntentSource[] = [
      new StubSource("cow", [intent]),
      new StubSource("oneinch", [
        {
          ...intent,
          source: "oneinch",
        },
      ]),
      new StubSource("manual", [
        {
          ...intent,
          source: "manual",
        },
      ]),
    ];

    const service = new IngestionService(sources, queue, { pollIntervalMs: 1000 });
    await service.pollOnce();

    expect(collected).toHaveLength(3);
    expect(queue.size()).toBe(3);
  });
});

