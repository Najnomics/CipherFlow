import { z } from "zod";

import { IntentQueue } from "./queue.js";
import { CowSource } from "./sources/cow.js";
import { OneInchSource } from "./sources/oneInch.js";
import { ManualSource } from "./sources/manual.js";
import { IngestionService } from "./ingestionService.js";

const envSchema = z.object({
  COW_API_URL: z.string().url().optional(),
  ONEINCH_API_URL: z.string().url().optional(),
  MANUAL_INTENT_URL: z.string().url().optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().optional(),
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

async function main() {
  console.log("[listener] starting ingestion service");
  ingestion.start();
}

void main();

process.on("SIGINT", () => {
  ingestion.stop();
  process.exit(0);
});

