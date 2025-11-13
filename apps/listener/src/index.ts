import { z } from "zod";

import { IntentQueue } from "./queue.js";
import { CowSource } from "./sources/cow.js";
import { OneInchSource } from "./sources/oneInch.js";
import { ManualSource } from "./sources/manual.js";
import { IngestionService } from "./ingestionService.js";
import { IntentHubPublisher } from "./intentHubPublisher.js";

const envSchema = z.object({
  COW_API_URL: z.string().url().optional(),
  ONEINCH_API_URL: z.string().url().optional(),
  MANUAL_INTENT_URL: z.string().url().optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  INTENT_PUBLISHER_RPC_URL: z.string().url().optional(),
  INTENT_PUBLISHER_PRIVATE_KEY: z.string().min(32).optional(),
  INTENT_PUBLISHER_NETWORK: z.string().optional(),
  INTENT_PUBLISHER_COMMIT_WINDOW_SECONDS: z.coerce.number().int().positive().optional(),
  INTENT_PUBLISHER_REVEAL_WINDOW_SECONDS: z.coerce.number().int().positive().optional(),
  INTENT_PUBLISHER_EXECUTION_WINDOW_SECONDS: z.coerce.number().int().positive().optional(),
  INTENT_PUBLISHER_CACHE_PATH: z.string().optional(),
  INTENT_HUB_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

const env = envSchema.parse(process.env);

const queue = new IntentQueue();
queue.onIntent((intent) => {
  console.log("[listener] intent enqueued", {
    source: intent.source,
    id: intent.externalId,
    from: intent.fromToken,
    to: intent.toToken,
  });
});

const sources = [
  new ManualSource(env.MANUAL_INTENT_URL),
];
if (env.COW_API_URL) {
  sources.push(new CowSource(env.COW_API_URL));
}
if (env.ONEINCH_API_URL) {
  sources.push(new OneInchSource(env.ONEINCH_API_URL));
}

const ingestion = new IngestionService(
  sources,
  queue,
  {
    pollIntervalMs: env.POLL_INTERVAL_MS ?? 15_000,
    logger: (message, meta) => {
      if (meta) {
        console.log(message, meta);
        return;
      }
      console.log(message);
    },
  },
);

if (env.INTENT_PUBLISHER_RPC_URL && env.INTENT_PUBLISHER_PRIVATE_KEY && env.INTENT_HUB_ADDRESS) {
  new IntentHubPublisher(queue, {
    rpcUrl: env.INTENT_PUBLISHER_RPC_URL,
    privateKey: env.INTENT_PUBLISHER_PRIVATE_KEY,
    intentHubAddress: env.INTENT_HUB_ADDRESS as `0x${string}`,
    networkName: env.INTENT_PUBLISHER_NETWORK,
    commitWindowSeconds: env.INTENT_PUBLISHER_COMMIT_WINDOW_SECONDS,
    revealWindowSeconds: env.INTENT_PUBLISHER_REVEAL_WINDOW_SECONDS,
    executionWindowSeconds: env.INTENT_PUBLISHER_EXECUTION_WINDOW_SECONDS,
    cachePath: env.INTENT_PUBLISHER_CACHE_PATH,
    logger: (message, meta) => {
      if (meta) {
        console.log(message, meta);
        return;
      }
      console.log(message);
    },
  });
} else {
  console.log("[listener] intent publisher disabled (missing RPC/private key or intent hub address)");
}

async function main() {
  console.log("[listener] starting ingestion service");
  ingestion.start();
}

void main();

process.on("SIGINT", () => {
  ingestion.stop();
  process.exit(0);
});

export { queue as listenerQueue, ingestion as listenerIngestion };

