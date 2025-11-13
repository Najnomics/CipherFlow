"use client";

import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { formatUnits } from "viem";

import { intentHubAbi } from "../lib/contracts";
import type { DashboardNetworkConfig } from "../types";

const COMMITMENT_STATE_EXECUTED = 3;
const MAX_COMMITMENTS = 32;

type SettlementAssetConfig = DashboardNetworkConfig["settlementAssets"][number];

interface ExecutionFeedProps {
  intentHubAddress: `0x${string}`;
  network: DashboardNetworkConfig;
}

interface ExecutionRow {
  commitmentId: bigint;
  intentId: bigint;
  solver: `0x${string}`;
  executor: `0x${string}`;
  settlementAsset: `0x${string}`;
  settlementSymbol: string;
  decimals: number;
  amountOut: bigint;
  solverPayout: bigint;
  collateral: bigint;
  settlementTxHash: `0x${string}`;
  executedAt: bigint;
  success: boolean;
}

export function ExecutionFeed({ intentHubAddress, network }: ExecutionFeedProps) {
  const publicClient = usePublicClient();
  const assetMap = useMemo(() => {
    const map = new Map<string, SettlementAssetConfig>();
    network.settlementAssets.forEach((asset) => map.set(asset.address.toLowerCase(), asset));
    return map;
  }, [network.settlementAssets]);

  const executionQuery = useQuery({
    queryKey: ["execution-feed", intentHubAddress],
    enabled:
      Boolean(publicClient) &&
      intentHubAddress !== "0x0000000000000000000000000000000000000000",
    refetchInterval: 20_000,
    queryFn: async (): Promise<ExecutionRow[]> => {
      if (!publicClient) return [];

      const nextCommitmentId = (await publicClient.readContract({
        address: intentHubAddress,
        abi: intentHubAbi,
        functionName: "nextCommitmentId",
      })) as bigint;

      if (nextCommitmentId === 0n) return [];

      const latestIds = Array.from(
        { length: Number(nextCommitmentId > BigInt(MAX_COMMITMENTS) ? MAX_COMMITMENTS : nextCommitmentId) },
        (_, idx) => nextCommitmentId - BigInt(idx),
      ).filter((id) => id > 0n);

      const records = await Promise.all(
        latestIds.map(async (commitmentId) => {
          try {
            const record = (await publicClient.readContract({
              address: intentHubAddress,
              abi: intentHubAbi,
              functionName: "getCommitment",
              args: [commitmentId],
            })) as any;

            return { commitmentId, record };
          } catch (error) {
            console.warn("[execution-feed] failed to fetch commitment", commitmentId.toString(), error);
            return null;
          }
        }),
      );

      const executed = records
        .filter((entry): entry is { commitmentId: bigint; record: any } => {
          if (!entry) return false;
          const state = Number(entry.record?.commitment?.state ?? 0);
          const executedAt = BigInt(entry.record?.execution?.executedAt ?? 0);
          return state === COMMITMENT_STATE_EXECUTED && executedAt > 0n;
        })
        .sort(
          (a, b) =>
            Number(BigInt(b.record.execution.executedAt ?? 0) -
              BigInt(a.record.execution.executedAt ?? 0)),
        );

      if (!executed.length) return [];

      const uniqueIntentIds = Array.from(
        new Set(
          executed.map((entry) => BigInt(entry.record.intentId ?? 0)),
        ),
      ).filter((intentId) => intentId > 0n);

      const intentDetails = new Map<string, any>();
      await Promise.all(
        uniqueIntentIds.map(async (intentId) => {
          try {
            const intent = await publicClient.readContract({
              address: intentHubAddress,
              abi: intentHubAbi,
              functionName: "getIntent",
              args: [intentId],
            });
            intentDetails.set(intentId.toString(), intent);
          } catch (error) {
            console.warn("[execution-feed] failed to fetch intent", intentId.toString(), error);
          }
        }),
      );

      return executed.map(({ commitmentId, record }) => {
        const intentId = BigInt(record.intentId ?? 0);
        const intent = intentDetails.get(intentId.toString());
        const settlementAsset =
          (intent?.settlementAsset as `0x${string}` | undefined) ??
          "0x0000000000000000000000000000000000000000";
        const assetConfig =
          assetMap.get(settlementAsset.toLowerCase()) ??
          assetMap.get("0x0000000000000000000000000000000000000000") ?? {
            symbol: "ETH",
            address: "0x0000000000000000000000000000000000000000",
            decimals: 18,
          };

        return {
          commitmentId,
          intentId,
          solver: record.commitment.solver as `0x${string}`,
          executor: record.execution.executor as `0x${string}`,
          settlementAsset,
          settlementSymbol: assetConfig.symbol,
          decimals: assetConfig.decimals,
          amountOut: BigInt(record.execution.amountOut ?? 0),
          solverPayout: BigInt(record.execution.solverPayout ?? 0),
          collateral: BigInt(record.commitment.collateral ?? 0),
          settlementTxHash: record.execution.settlementTxHash as `0x${string}`,
          executedAt: BigInt(record.execution.executedAt ?? 0),
          success: Boolean(record.execution.success),
        } satisfies ExecutionRow;
      });
    },
  });

  if (executionQuery.isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-medium text-slate-100">Solver Settlements</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">Loading…</span>
        </header>
        <p className="text-sm text-slate-500">
          Pulling executed commitments from IntentHub…
        </p>
      </section>
    );
  }

  if (executionQuery.error) {
    return (
      <section className="rounded-xl border border-rose-800 bg-rose-950/70 p-6 shadow-xl space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-medium text-slate-100">Solver Settlements</h2>
          <span className="text-xs uppercase tracking-wide text-rose-300">Error</span>
        </header>
        <p className="text-sm text-rose-200">
          {(executionQuery.error as Error).message ?? "Unable to fetch execution data."}
        </p>
      </section>
    );
  }

  const rows = executionQuery.data ?? [];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-medium text-slate-100">Solver Settlements</h2>
          <p className="text-sm text-slate-400">
            Recent executed commitments showing solver payouts and settlement hashes.
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
          {rows.length} records
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No executions recorded yet. Once a solver finalizes an intent, settlement details will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const successBadge = row.success
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-rose-500/10 text-rose-300";
            const executedDate = formatDistanceToNow(
              new Date(Number(row.executedAt) * 1000),
              { addSuffix: true },
            );

            return (
              <article
                key={row.commitmentId.toString()}
                className="rounded-lg border border-slate-800/60 bg-slate-900/70 p-4"
              >
                <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Intent #{row.intentId.toString()} · Commitment #{row.commitmentId.toString()}
                    </p>
                    <h3 className="text-lg font-semibold text-slate-100">
                      Solver {row.solver.slice(0, 6)}…{row.solver.slice(-4)}
                    </h3>
                  </div>
                  <span className={clsx("w-fit rounded-full px-3 py-1 text-xs font-semibold", successBadge)}>
                    {row.success ? "Succeeded" : "Failed"}
                  </span>
                </header>

                <dl className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
                  <div>
                    <dt className="text-slate-400">Settlement Amount</dt>
                    <dd>
                      {formatUnits(row.amountOut, row.decimals)} {row.settlementSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Solver Payout</dt>
                    <dd>
                      {formatUnits(row.solverPayout, row.decimals)} {row.settlementSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Collateral Locked</dt>
                    <dd>{formatUnits(row.collateral, 18)} ETH</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Executor</dt>
                    <dd className="font-mono text-xs text-blue-300">
                      {row.executor}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-col gap-2 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
                  <span>Executed {executedDate}</span>
                  <span className="font-mono text-blue-300">
                    Tx:{" "}
                    {row.settlementTxHash === "0x"
                      ? "—"
                      : (
                          <a
                            className="underline"
                            href={`https://sepolia.basescan.org/tx/${row.settlementTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {row.settlementTxHash.slice(0, 10)}…
                          </a>
                        )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}


