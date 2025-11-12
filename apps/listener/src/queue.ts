import { EventEmitter } from "node:events";

import type { NormalizedIntent } from "./types.js";

type IntentListener = (intent: NormalizedIntent) => void;

export class IntentQueue {
  private readonly emitter = new EventEmitter();
  private readonly buffer: NormalizedIntent[] = [];

  enqueue(intent: NormalizedIntent) {
    this.buffer.push(intent);
    this.emitter.emit("intent", intent);
  }

  enqueueMany(intents: NormalizedIntent[]) {
    for (const intent of intents) {
      this.enqueue(intent);
    }
  }

  dequeue(): NormalizedIntent | undefined {
    return this.buffer.shift();
  }

  size(): number {
    return this.buffer.length;
  }

  snapshot(limit = this.buffer.length): NormalizedIntent[] {
    if (limit >= this.buffer.length) {
      return [...this.buffer];
    }
    return this.buffer.slice(-limit);
  }

  onIntent(listener: IntentListener) {
    this.emitter.on("intent", listener);
    return () => this.emitter.off("intent", listener);
  }
}

