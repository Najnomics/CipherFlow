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
  status: "open" | "expired";
  ageSeconds: number;
  commitDeadline: number;
  revealDeadline: number;
  executionDeadline: number;
}

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

interface PlannerResponse {
  reports: PlannerSnapshot[];
  summary: {
    profitable: number;
    lossMaking: number;
    breakEven: number;
    pending: number;
  };
  lastUpdated: number;
}

const formatWei = (value: string, decimals = 18) => {
  const base = 10 ** Math.min(decimals, 18);
  return (Number(BigInt(value)) / base).toFixed(4);
};

function formatDeadline(seconds: number) {
  if (!seconds) return "–";
  return formatDistanceToNow(new Date(seconds * 1000), { addSuffix: true });
}

function formatProfit(value: string) {
  const profit = Number(BigInt(value)) / 1e18;
  return profit.toFixed(4);
}

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
    refetchInterval: 15_000,
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Intent Feed</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {intentsQuery.data?.length ?? 0} intents
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {intentsQuery.data?.map((intent) => (
            <article
              key={intent.intentId}
              className={clsx(
                "rounded-xl border p-4 shadow-lg transition-colors",
                intent.status === "expired"
                  ? "border-rose-800/70 bg-rose-950/40"
                  : "border-slate-800 bg-slate-900/60",
              )}
            >
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>{intent.source.toUpperCase()}</span>
                <span>
                  {formatDistanceToNow(new Date(intent.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-100">
                  Intent #{intent.intentId}
                </h3>
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    intent.status === "expired"
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-emerald-500/10 text-emerald-400",
                  )}
                >
                  {intent.status === "expired" ? "Expired" : "Open"}
                </span>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-slate-300">
                <div className="flex justify-between">
                  <dt>Amount In</dt>
                  <dd>
                    {formatWei(intent.amountIn)} {intent.fromToken || "Token"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Min Amount Out</dt>
                  <dd>
                    {formatWei(intent.minAmountOut)} {intent.toToken || "Token"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Source Chain</dt>
                  <dd>{intent.sourceChainId || "–"}</dd>
                </div>
                <div className="flex justify-between text-slate-400">
                  <dt>Reveal Window</dt>
                  <dd>{formatDeadline(intent.revealDeadline)}</dd>
                </div>
                <div className="flex justify-between text-slate-400">
                  <dt>Execution Window</dt>
                  <dd>{formatDeadline(intent.executionDeadline)}</dd>
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
          <h2 className="text-xl font-medium">Solver Snapshots</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>
              Updated {plannerQuery.data?.lastUpdated
                ? formatDistanceToNow(new Date(plannerQuery.data.lastUpdated), {
                    addSuffix: true,
                  })
                : "–"}
            </span>
            <button
              onClick={() => plannerQuery.refetch()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-blue-600"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-6">
          {plannerQuery.data ? (
            <>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300">
                  Profitable: {plannerQuery.data.summary.profitable}
                </span>
                <span className="rounded-md bg-amber-500/10 px-2 py-1 font-medium text-amber-300">
                  Break Even: {plannerQuery.data.summary.breakEven}
                </span>
                <span className="rounded-md bg-rose-500/10 px-2 py-1 font-medium text-rose-300">
                  Losses: {plannerQuery.data.summary.lossMaking}
                </span>
                <span className="rounded-md bg-slate-500/10 px-2 py-1 font-medium text-slate-300">
                  Pending: {plannerQuery.data.summary.pending}
                </span>
                <span className="text-slate-500">
                  Showing latest {plannerQuery.data.reports.length} routes
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {plannerQuery.data.reports.map((report) => {
                  const profit = BigInt(report.netProfit);
                  const profitClass =
                    profit > 0n
                      ? "text-emerald-400 bg-emerald-500/10"
                      : profit < 0n
                      ? "text-rose-400 bg-rose-500/10"
                      : "text-slate-300 bg-slate-500/10";

                  const badgeClass =
                    report.status === "won"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : report.status === "loss"
                      ? "bg-rose-500/10 text-rose-300"
                      : report.status === "expired"
                      ? "bg-slate-500/20 text-slate-300"
                      : "bg-amber-500/10 text-amber-300";

                  return (
                    <article
                      key={`${report.intentId}-${report.source}`}
                      className="rounded-lg border border-slate-800/60 bg-slate-900/70 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs uppercase tracking-wide text-slate-500">
                            {report.source === "live" ? "Live" : "Simulated"} Route
                          </span>
                          <h3 className="text-lg font-semibold text-slate-100">
                            Intent #{report.intentId}
                          </h3>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs">
                          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-medium text-blue-300">
                            {report.venueLabel}
                          </span>
                          <span
                            className={clsx(
                              "rounded-full px-2 py-0.5 font-medium",
                              badgeClass,
                            )}
                          >
                            {report.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
                        <div>
                          <dt className="text-slate-400">Amount In</dt>
                          <dd>{formatWei(report.amountIn)} RUSD</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Amount Out</dt>
                          <dd>{formatWei(report.amountOut)} RUSD</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Gas Cost</dt>
                          <dd>{formatWei(report.gasCost)} RUSD</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Bridge Fee</dt>
                          <dd>{formatWei(report.bridgeFee)} RUSD</dd>
                        </div>
                      </dl>

                      <div
                        className={clsx(
                          "mt-4 inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold",
                          profitClass,
                        )}
                      >
                        Net Profit {formatProfit(report.netProfit)} RUSD
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        Quote issued {formatDistanceToNow(new Date(report.quoteIssuedAt), {
                          addSuffix: true,
                        })}
                      </p>

                      {report.warnings?.length ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-300">
                          {report.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No route data yet. Trigger the solver or adjust the mock
              configuration.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

