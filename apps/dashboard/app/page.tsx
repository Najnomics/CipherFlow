"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";

interface Intent {
  intentId: string;
  source: string;
  fromToken: string;
  toToken: string;
  amountIn: string;
  minAmountOut: string;
  sourceChainId: number;
  createdAt: string;
}

interface PlannerResponse {
  intent: {
    intentId: string;
  };
  report: {
    venue: string;
    amountOut: string;
    amountIn: string;
    gasCost: string;
    bridgeFee: string;
    netProfit: string;
    quoteIssuedAt: number;
    warnings: string[];
  } | null;
}

const formatWei = (value: string) =>
  (Number(BigInt(value)) / 1e18).toFixed(4);

export default function DashboardPage() {
  const intentsQuery = useQuery({
    queryKey: ["intents"],
    queryFn: async (): Promise<Intent[]> => {
      const res = await fetch("/api/mock-intents");
      const data = await res.json();
      return data.intents;
    },
    refetchInterval: 10_000,
  });

  const plannerQuery = useQuery({
    queryKey: ["planner"],
    queryFn: async (): Promise<PlannerResponse> => {
      const res = await fetch("/api/planner");
      return res.json();
    },
  });

  return (
    <main className="min-h-screen px-6 py-10 space-y-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          CipherFlow Dashboard
        </h1>
        <p className="text-slate-400">
          Monitor intents, solver profitability, and mock bridge scenarios
          without needing live cross-chain liquidity.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-medium mb-4">Intent Feed</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {intentsQuery.data?.map((intent) => (
            <article
              key={intent.intentId}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg"
            >
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>{intent.source.toUpperCase()}</span>
                <span>
                  {formatDistanceToNow(new Date(intent.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-100">
                Intent #{intent.intentId}
              </h3>
              <dl className="mt-3 space-y-1 text-sm text-slate-300">
                <div className="flex justify-between">
                  <dt>Amount In</dt>
                  <dd>{formatWei(intent.amountIn)} {intent.fromToken}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Min Amount Out</dt>
                  <dd>{formatWei(intent.minAmountOut)} {intent.toToken}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Source Chain</dt>
                  <dd>{intent.sourceChainId}</dd>
                </div>
              </dl>
            </article>
          ))}
          {intentsQuery.data?.length === 0 && (
            <p className="text-sm text-slate-500">
              No intents yet. Configure the listener or add manual payloads.
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Solver Snapshot</h2>
          <button
            onClick={() => plannerQuery.refetch()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          {plannerQuery.data?.report ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-400">
                  Venue: {plannerQuery.data.report.venue}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-400">
                  Net Profit:{" "}
                  {(
                    Number(BigInt(plannerQuery.data.report.netProfit)) / 1e18
                  ).toFixed(4)}{" "}
                  RUSD
                </span>
              </div>
              <dl className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-400">Amount In</dt>
                  <dd>{formatWei(plannerQuery.data.report.amountIn)} RUSD</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Amount Out</dt>
                  <dd>{formatWei(plannerQuery.data.report.amountOut)} RUSD</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Gas Cost</dt>
                  <dd>{formatWei(plannerQuery.data.report.gasCost)} RUSD</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Bridge Fee</dt>
                  <dd>{formatWei(plannerQuery.data.report.bridgeFee)} RUSD</dd>
                </div>
              </dl>
              {plannerQuery.data.report.warnings?.length ? (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-400">
                  {plannerQuery.data.report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No profitable route was detected with the current configuration.
              Adjust your mock bridge config or enable real connectors.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

