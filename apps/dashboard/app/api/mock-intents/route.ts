import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTENER_API_URL = process.env.LISTENER_API_URL;
const RANDOM_INTENT_COUNT = Number(process.env.MOCK_INTENT_RANDOM_COUNT ?? 4);

const fallbackIntents = [
  {
    intentId: "301",
    source: "manual",
    fromToken: "RUSD",
    toToken: "RUSD",
    amountIn: "1000000000000000000",
    minAmountOut: "950000000000000000",
    sourceChainId: 84532,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    commitDeadline: Math.floor(Date.now() / 1000) + 900,
    revealDeadline: Math.floor(Date.now() / 1000) + 1800,
    executionDeadline: Math.floor(Date.now() / 1000) + 3600,
  },
  {
    intentId: "302",
    source: "manual",
    fromToken: "RUSD",
    toToken: "RUSD",
    amountIn: "750000000000000000",
    minAmountOut: "720000000000000000",
    sourceChainId: 84532,
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    commitDeadline: Math.floor(Date.now() / 1000) - 600,
    revealDeadline: Math.floor(Date.now() / 1000) - 300,
    executionDeadline: Math.floor(Date.now() / 1000) - 60,
  },
  {
    intentId: "303",
    source: "manual",
    fromToken: "USDC",
    toToken: "RUSD",
    amountIn: "150000000000",
    minAmountOut: "148000000000",
    sourceChainId: 8453,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    commitDeadline: Math.floor(Date.now() / 1000) - 5400,
    revealDeadline: Math.floor(Date.now() / 1000) - 3600,
    executionDeadline: Math.floor(Date.now() / 1000) - 1800,
  },
];

const randomTokens = [
  { symbol: "RUSD", decimals: 18 },
  { symbol: "USDC", decimals: 6 },
  { symbol: "DAI", decimals: 18 },
];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBigAmount(decimals: number, min = 0.4, max = 1.5): string {
  const value = (Math.random() * (max - min) + min) * 10 ** decimals;
  return BigInt(Math.floor(value)).toString();
}

function generateRandomIntent(): typeof fallbackIntents[number] {
  const now = Date.now();
  const token = randomFrom(randomTokens);
  const intentId = randomUUID().slice(0, 8);
  const createdAt = new Date(now - Math.random() * 45 * 60 * 1000).toISOString();
  const baseDeadline = Math.floor(now / 1000) + Math.floor(Math.random() * 1200);
  const isExpired = Math.random() < 0.35;
  const executionDeadline = isExpired
    ? baseDeadline - Math.floor(Math.random() * 3600)
    : baseDeadline + Math.floor(Math.random() * 1800);

  const amountIn = randomBigAmount(token.decimals);
  const slippage = Math.random() * 0.05;
  const minAmountOut = BigInt(BigInt(amountIn) - BigInt(Math.floor(Number(amountIn) * slippage))).toString();

  return {
    intentId,
    source: randomFrom(["manual", "cow", "oneinch"]),
    fromToken: token.symbol,
    toToken: randomFrom(randomTokens).symbol,
    amountIn,
    minAmountOut,
    sourceChainId: randomFrom([8453, 84532, 421614]),
    createdAt,
    commitDeadline: baseDeadline - 300,
    revealDeadline: baseDeadline,
    executionDeadline,
  };
}

type IntentShape = typeof fallbackIntents[number];

type NormalizedIntent = IntentShape & {
  status: "open" | "expired";
  ageSeconds: number;
};

function annotateIntent(intent: IntentShape): NormalizedIntent {
  const now = Date.now();
  const executionDeadline = intent.executionDeadline * 1000;
  const status = now > executionDeadline ? "expired" : "open";
  const ageSeconds = Math.floor((now - new Date(intent.createdAt).getTime()) / 1000);
  return { ...intent, status, ageSeconds };
}

async function fetchListenerIntents(): Promise<NormalizedIntent[]> {
  if (!LISTENER_API_URL) {
    return [];
  }

  try {
    const url = new URL("/intents", LISTENER_API_URL);
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn("[dashboard] listener responded with", res.status);
      return [];
    }

    const data = (await res.json()) as { intents?: Array<Record<string, unknown>> };
    if (!Array.isArray(data.intents)) {
      return [];
    }

    return data.intents.map((rawIntent) => {
      const intent = rawIntent as {
        intentId?: unknown;
        externalId?: unknown;
        source?: unknown;
        fromToken?: unknown;
        toToken?: unknown;
        amountIn?: unknown;
        minAmountOut?: unknown;
        sourceChainId?: unknown;
        createdAt?: unknown;
        commitDeadline?: unknown;
        revealDeadline?: unknown;
        executionDeadline?: unknown;
        metadata?: Record<string, unknown>;
      };

      const metadata = intent.metadata ?? {};
      const createdAt =
        typeof intent.createdAt === "string" ? intent.createdAt : new Date().toISOString();

      const commitDeadline = Number(
        intent.commitDeadline ?? metadata.commitDeadline ?? 0,
      );
      const revealDeadline = Number(intent.revealDeadline ?? metadata.revealDeadline ?? 0);
      const executionDeadline = Number(
        intent.executionDeadline ?? metadata.executionDeadline ?? 0,
      );

      const enriched: IntentShape = {
        intentId: String(intent.intentId ?? intent.externalId ?? randomUUID()),
        source: String(intent.source ?? "unknown"),
        fromToken: String(intent.fromToken ?? metadata.fromToken ?? ""),
        toToken: String(intent.toToken ?? metadata.toToken ?? ""),
        amountIn: String(intent.amountIn ?? "0"),
        minAmountOut: String(intent.minAmountOut ?? "0"),
        sourceChainId: Number(intent.sourceChainId ?? 0),
        createdAt,
        commitDeadline,
        revealDeadline,
        executionDeadline,
      };
      return annotateIntent(enriched);
    });
  } catch (error) {
    console.warn("[dashboard] listener fetch failed", error);
    return [];
  }
}

export async function GET() {
  const remoteIntents = await fetchListenerIntents();
  const randomIntents = Array.from({ length: RANDOM_INTENT_COUNT }, generateRandomIntent);

  const intents = [
    ...remoteIntents,
    ...randomIntents.map(annotateIntent),
    ...fallbackIntents.map(annotateIntent),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 24);

  return NextResponse.json({ intents });
}


