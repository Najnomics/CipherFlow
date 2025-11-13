import { NextResponse } from "next/server";
import {
  createDefaultConnectors,
  type QuoteConnector,
  type QuoteResult,
} from "@cipherflow/markets";
import { zeroAddress } from "viem";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PlannerSnapshot {
  intentId: string;
  venue: string;
  venueLabel: string;
  amountIn: string;
  amountOut: string;
  gasCost: string;
  bridgeFee: string;
  netProfit: string;
  quoteIssuedAt: number;
  warnings: string[];
  status: "won" | "loss" | "expired" | "pending";
  source: "live" | "fallback" | "telemetry" | "synthetic";
}

interface SolverTelemetryEntry {
  id: string;
  intentId: string;
  venue: string;
  venueLabel?: string;
  amountIn: string;
  amountOut: string;
  gasCost: string;
  bridgeFee: string;
  netProfit: string;
  timestamp: number;
  status: "planned" | "committed" | "failed";
  warnings?: string[];
  error?: string;
}

const connectors = createDefaultConnectors({
  mockBridge: process.env.MOCK_BRIDGE_CONFIG
    ? JSON.parse(process.env.MOCK_BRIDGE_CONFIG)
    : undefined,
});

const GAS_PRICE_WEI = BigInt(process.env.GAS_PRICE_GWEI ?? 25) * 10n ** 9n;
const AMOUNT_IN = 1_000_000_000_000_000_000n;
const TELEMETRY_FILE = resolve(
  process.cwd(),
  process.env.SOLVER_TELEMETRY_FILE ?? "../.cache/solver-telemetry.json",
);
const RANDOM_SNAPSHOT_COUNT = Number(process.env.PLANNER_RANDOM_COUNT ?? 3);
const RANDOM_WIN_COUNT = Number(process.env.PLANNER_RANDOM_WIN_COUNT ?? 2);
const RANDOM_LOSS_COUNT = Number(process.env.PLANNER_RANDOM_LOSS_COUNT ?? 1);
const RANDOM_PENDING_COUNT = Number(process.env.PLANNER_RANDOM_PENDING_COUNT ?? 0);
const DISABLE_LIVE = process.env.PLANNER_DISABLE_LIVE === "true";

const fallbackSnapshots: PlannerSnapshot[] = [
  {
    intentId: "402",
    venue: "mock-bridge",
    venueLabel: "Mock Bridge",
    amountIn: AMOUNT_IN.toString(),
    amountOut: "1055000000000000000",
    gasCost: "2500000000000000",
    bridgeFee: "500000000000000",
    netProfit: "2500000000000000",
    quoteIssuedAt: Date.now() - 3 * 60 * 1000,
    warnings: ["Simulated bridge route"],
    status: "won",
    source: "fallback",
  },
  {
    intentId: "401",
    venue: "uniswap",
    venueLabel: "Uniswap",
    amountIn: "750000000000000000",
    amountOut: "760500000000000000",
    gasCost: "1500000000000000",
    bridgeFee: "0",
    netProfit: "4500000000000000",
    quoteIssuedAt: Date.now() - 15 * 60 * 1000,
    warnings: [],
    status: "won",
    source: "fallback",
  },
  {
    intentId: "399",
    venue: "aerodrome",
    venueLabel: "Aerodrome",
    amountIn: AMOUNT_IN.toString(),
    amountOut: "1000000000000000000",
    gasCost: "3700000000000000",
    bridgeFee: "0",
    netProfit: "-3700000000000000",
    quoteIssuedAt: Date.now() - 35 * 60 * 1000,
    warnings: ["Aerodrome connector returns stub data"],
    status: "loss",
    source: "fallback",
  },
];

const recentSnapshots: PlannerSnapshot[] = [];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateRandomSnapshot(kind: "win" | "loss" | "pending"): PlannerSnapshot {
  const venues = [
    { id: "mock-bridge", label: "Mock Bridge", weight: 4 },
    { id: "uniswap", label: "Uniswap", weight: 3 },
    { id: "curve", label: "Curve", weight: 4 },
    { id: "aerodrome", label: "Aerodrome", weight: 1 },
  ];
  const totalWeight = venues.reduce((sum, venue) => sum + venue.weight, 0);
  let pick = Math.random() * totalWeight;
  const venue = venues.find((entry) => {
    pick -= entry.weight;
    return pick <= 0;
  }) ?? venues[0];
  const amountIn = AMOUNT_IN.toString();

  const baseOut = Number(AMOUNT_IN);
  let grossOut = baseOut;
  if (kind === "win") {
    grossOut = Math.floor(baseOut * randomBetween(1.015, 1.12));
  } else if (kind === "loss") {
    grossOut = Math.floor(baseOut * randomBetween(0.94, 0.995));
  } else {
    grossOut = baseOut;
  }

  const gasCost = BigInt(Math.floor(baseOut * randomBetween(0.001, 0.004))).toString();
  const bridgeFee = venue.id === "mock-bridge" && kind !== "loss"
    ? BigInt(Math.floor(baseOut * randomBetween(0.0003, 0.001))).toString()
    : "0";

  const netProfit = (BigInt(grossOut) - AMOUNT_IN - BigInt(bridgeFee) - BigInt(gasCost)).toString();
  const status: PlannerSnapshot["status"] =
    kind === "win" ? "won" : kind === "loss" ? "loss" : "pending";

  return {
    intentId: randomUUID().slice(0, 8),
    venue: venue.id,
    venueLabel: venue.label,
    amountIn,
    amountOut: BigInt(grossOut).toString(),
    gasCost,
    bridgeFee,
    netProfit,
    quoteIssuedAt: Date.now() - Math.floor(Math.random() * 20 * 60 * 1000),
    warnings: venue.id === "mock-bridge" ? ["Synthesised bridge scenario"] : [],
    status,
    source: "synthetic",
  };
}

async function readSolverTelemetry(): Promise<PlannerSnapshot[]> {
  try {
    const raw = await fs.readFile(TELEMETRY_FILE, "utf8");
    const entries: SolverTelemetryEntry[] = JSON.parse(raw);
    return entries.map((entry) => {
      const profit = BigInt(entry.netProfit);
      let status: PlannerSnapshot["status"] = "pending";
      if (entry.status === "committed") {
        status = profit >= 0n ? "won" : "loss";
      } else if (entry.status === "failed") {
        status = "loss";
      }
      return {
        intentId: entry.intentId,
        venue: entry.venue,
        venueLabel: entry.venueLabel ?? formatVenue(entry.venue),
        amountIn: entry.amountIn,
        amountOut: entry.amountOut,
        gasCost: entry.gasCost,
        bridgeFee: entry.bridgeFee,
        netProfit: entry.netProfit,
        quoteIssuedAt: entry.timestamp,
        warnings: entry.warnings ?? (entry.error ? [entry.error] : []),
        status,
        source: "telemetry",
      } satisfies PlannerSnapshot;
    });
  } catch {
    return [];
  }
}

async function collectQuotes(): Promise<Array<{ quote: QuoteResult; connector: QuoteConnector }>> {
  const intent = {
    chainId: 84532,
    fromToken: zeroAddress,
    toToken: zeroAddress,
    amountIn: AMOUNT_IN,
  };

  const results = await Promise.all(
    connectors.map(async (connector) => {
      try {
        const quote = await connector.getQuote({
          chainId: intent.chainId,
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amountIn: intent.amountIn,
          destinationChainId: intent.chainId,
        });
        return quote ? { connector, quote } : null;
      } catch (error) {
        console.error("planner error", connector.venue, error);
        return null;
      }
    }),
  );

  return results.filter((entry): entry is { connector: QuoteConnector; quote: QuoteResult } => entry !== null);
}

function netAmountOut(quote: QuoteResult): bigint {
  const bridgeFee = quote.leg.bridgeFee ?? 0n;
  const gas = quote.leg.gasEstimate * GAS_PRICE_WEI;
  return quote.leg.expectedAmountOut - bridgeFee - gas;
}

function formatVenue(venue: string): string {
  switch (venue) {
    case "mock-bridge":
      return "Mock Bridge";
    case "aerodrome":
      return "Aerodrome";
    case "uniswap":
      return "Uniswap";
    case "curve":
      return "Curve";
    default:
      return venue.replace(/(^|-)(\w)/g, (_, sep, char) => `${sep ? " " : ""}${char.toUpperCase()}`);
  }
}

function recordSnapshot(snapshot: PlannerSnapshot) {
  recentSnapshots.unshift(snapshot);
  if (recentSnapshots.length > 10) {
    recentSnapshots.pop();
  }
}

export async function GET() {
  const [quotes, telemetrySnapshots] = await Promise.all([
    DISABLE_LIVE ? Promise.resolve([]) : collectQuotes(),
    readSolverTelemetry(),
  ]);
  let liveSnapshot: PlannerSnapshot | null = null;

  if (quotes.length) {
    const best = quotes.reduce((top, candidate) => {
      const topNet = netAmountOut(top.quote);
      const candidateNet = netAmountOut(candidate.quote);

      if (candidateNet > topNet) {
        return candidate;
      }
      if (candidateNet === topNet) {
        return candidate.quote.leg.gasEstimate < top.quote.leg.gasEstimate ? candidate : top;
      }
      return top;
    }, quotes[0]);

    const bridgeFee = best.quote.leg.bridgeFee ?? 0n;
    const gasCost = best.quote.leg.gasEstimate * GAS_PRICE_WEI;
    const netProfit = best.quote.leg.expectedAmountOut - AMOUNT_IN - bridgeFee - gasCost;

    liveSnapshot = {
      intentId: String(best.quote.intentId ?? Date.now()),
      venue: best.quote.leg.venue,
      venueLabel: formatVenue(best.quote.leg.venue),
      amountOut: best.quote.leg.expectedAmountOut.toString(),
      amountIn: AMOUNT_IN.toString(),
      gasCost: gasCost.toString(),
      bridgeFee: bridgeFee.toString(),
      netProfit: netProfit.toString(),
      quoteIssuedAt: best.quote.quoteTimestamp ?? Date.now(),
      warnings: best.quote.warnings ?? [],
      status: netProfit > 0n ? "won" : netProfit === 0n ? "pending" : "loss",
      source: "live",
    } satisfies PlannerSnapshot;

    recordSnapshot(liveSnapshot);
  }

  const syntheticSnapshots = [
    ...Array.from({ length: Math.max(0, RANDOM_WIN_COUNT) }, () => generateRandomSnapshot("win")),
    ...Array.from({ length: Math.max(0, RANDOM_LOSS_COUNT) }, () => generateRandomSnapshot("loss")),
    ...Array.from({ length: Math.max(0, RANDOM_PENDING_COUNT) }, () => generateRandomSnapshot("pending")),
  ];

  const snapshots = [
    ...(liveSnapshot ? [liveSnapshot] : []),
    ...recentSnapshots.filter((snapshot) => snapshot.source === "live"),
    ...telemetrySnapshots,
    ...fallbackSnapshots,
    ...syntheticSnapshots,
  ]
    .reduce<PlannerSnapshot[]>((acc, snapshot) => {
      if (!acc.find((entry) => entry.intentId === snapshot.intentId && entry.source === snapshot.source)) {
        acc.push(snapshot);
      }
      return acc;
    }, [])
    .sort((a, b) => b.quoteIssuedAt - a.quoteIssuedAt)
    .slice(0, 12);

  const summary = snapshots.reduce(
    (acc, snapshot) => {
      const profit = BigInt(snapshot.netProfit);
      if (snapshot.status === "pending" || snapshot.status === "expired") {
        acc.pending += 1;
        return acc;
      }
      if (profit > 0n) {
        acc.profitable += 1;
      } else if (profit < 0n) {
        acc.lossMaking += 1;
      } else {
        acc.breakEven += 1;
      }
      return acc;
    },
    { profitable: 0, lossMaking: 0, breakEven: 0, pending: 0 },
  );

  return NextResponse.json({
    reports: snapshots,
    summary,
    lastUpdated: Date.now(),
    configuration: {
      randomWins: RANDOM_WIN_COUNT,
      randomLosses: RANDOM_LOSS_COUNT,
      randomPending: RANDOM_PENDING_COUNT,
      liveDisabled: DISABLE_LIVE,
    },
  });
}

