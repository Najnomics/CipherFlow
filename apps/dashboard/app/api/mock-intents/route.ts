import { NextResponse } from "next/server";

const LISTENER_API_URL = process.env.LISTENER_API_URL;

const fallbackIntents = [
  {
    intentId: "1",
    source: "manual",
    fromToken: "RUSD",
    toToken: "RUSD",
    amountIn: "1000000000000000000",
    minAmountOut: "950000000000000000",
    sourceChainId: 84532,
    createdAt: new Date().toISOString(),
  },
  {
    intentId: "2",
    source: "manual",
    fromToken: "RUSD",
    toToken: "RUSD",
    amountIn: "500000000000000000",
    minAmountOut: "470000000000000000",
    sourceChainId: 84532,
    createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
  },
];

async function fetchListenerIntents() {
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

    const data = (await res.json()) as { intents?: unknown[] };
    if (!Array.isArray(data.intents)) {
      return [];
    }

    return data.intents as typeof fallbackIntents;
  } catch (error) {
    console.warn("[dashboard] listener fetch failed", error);
    return [];
  }
}

export async function GET() {
  const remoteIntents = await fetchListenerIntents();
  return NextResponse.json({ intents: remoteIntents.length ? remoteIntents : fallbackIntents });
}

