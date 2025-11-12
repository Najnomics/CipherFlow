import type { IntentSource, NormalizedIntent } from "./types.js";
import { IntentQueue } from "./queue.js";

export interface IngestionServiceOptions {
  pollIntervalMs: number;
  dedupeWindow?: number;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

export class IngestionService {
  private readonly sources: IntentSource[];
  private readonly queue: IntentQueue;
  private readonly options: IngestionServiceOptions;
  private pollTimer?: NodeJS.Timeout;
  private readonly seen = new Map<string, number>();

  constructor(sources: IntentSource[], queue: IntentQueue, options: IngestionServiceOptions) {
    this.sources = sources;
    this.queue = queue;
    this.options = options;
  }

  start() {
    if (this.pollTimer) return;
    const execute = async () => {
      await this.pollOnce();
      this.pollTimer = setTimeout(execute, this.options.pollIntervalMs);
    };
    void execute();
  }

  stop() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  async pollOnce(): Promise<void> {
    const results = await Promise.all(this.sources.map((source) => this.pullFromSource(source)));
    const flattened = results.flat();
    if (flattened.length > 0) {
      this.queue.enqueueMany(flattened);
    }
    this.pruneSeen();
  }

  private async pullFromSource(source: IntentSource): Promise<NormalizedIntent[]> {
    try {
      const intents = await source.pullIntents();
      const deduped = intents.filter((intent) => this.registerIntent(intent));
      if (deduped.length && this.options.logger) {
        this.options.logger("[listener] ingested intents", {
          source: source.name,
          count: deduped.length,
        });
      }
      return deduped;
    } catch (error) {
      this.options.logger?.("[listener] source failure", {
        source: source.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private registerIntent(intent: NormalizedIntent): boolean {
    const key = `${intent.source}:${intent.externalId}`;
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.set(key, Date.now());
    return true;
  }

  private pruneSeen() {
    const ttl = this.options.dedupeWindow ?? 5 * 60 * 1000;
    const now = Date.now();
    for (const [key, timestamp] of this.seen.entries()) {
      if (now - timestamp > ttl) {
        this.seen.delete(key);
      }
    }
  }
}

