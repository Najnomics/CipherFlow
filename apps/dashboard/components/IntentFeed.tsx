"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";

import { intentHubAbi } from "../lib/contracts";

const AUCTION_STATES = ["Uninitialized", "Open", "Revealed", "Settled", "Cancelled", "Expired"] as const;

interface SettlementAssetConfig {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}

interface IntentFeedProps {
  intentHubAddress: `0x${string}`;
  assets: SettlementAssetConfig[];
}

interface IntentRow {
  intentId: bigint;
  trader: `0x${string}`;
  settlementAsset: `0x${string}`;
  recipient: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  commitDeadline: bigint;
  revealDeadline: bigint;
  executionDeadline: bigint;
  state: number;
}

export function IntentFeed({ intentHubAddress, assets }: IntentFeedProps) {
  const publicClient = usePublicClient();
  const assetMap = useMemo(() => {
    const map = new Map<string, SettlementAssetConfig>();
    assets.forEach((asset) => map.set(asset.address.toLowerCase(), asset));
    return map;
  }, [assets]);

  const intentsQuery = useQuery({
    queryKey: ["intent-feed", intentHubAddress],
    enabled: Boolean(publicClient && intentHubAddress !== "0x0000000000000000000000000000000000000000"),
    refetchInterval: 15_000,
    queryFn: async (): Promise<IntentRow[]> => {
      if (!publicClient) return [];

      const nextIntentId = (await publicClient.readContract({
        address: intentHubAddress,
        abi: intentHubAbi,
        functionName: "nextIntentId",
      })) as bigint;

      if (nextIntentId === 0n) return [];

      const ids = Array.from({ length: Number(nextIntentId) }, (_, idx) => BigInt(idx + 1));
      const intents = await Promise.all(
        ids.map(async (intentId) => {
          const intent = (await publicClient.readContract({
            address: intentHubAddress,
            abi: intentHubAbi,
            functionName: "getIntent",
            args: [intentId],
          })) as {
            trader: `0x${string}`;
            settlementAsset: `0x${string}`;
            recipient: `0x${string}`;
            amountIn: bigint;
            minAmountOut: bigint;
            commitDeadline: bigint;
            revealDeadline: bigint;
            executionDeadline: bigint;
            extraData: `0x${string}`;
            state: number;
          };

          return { intentId, ...intent } satisfies IntentRow;
        }),
      );

      return intents
        .filter((intent) => intent.state !== 0)
        .sort((a, b) => Number(b.intentId - a.intentId));
    },
  });

  if (intentsQuery.isPending) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-medium text-slate-100">Intent Feed</h2>
          <span className="text-xs text-slate-500 uppercase tracking-wide">Loading…</span>
        </header>
        <p className="text-sm text-slate-500">Retrieving intents from IntentHub…</p>
      </section>
    );
  }

  if (intentsQuery.error) {
    return (
      <section className="rounded-xl border border-rose-800 bg-rose-950/70 p-6 shadow-xl space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-medium text-slate-100">Intent Feed</h2>
          <span className="text-xs uppercase tracking-wide text-rose-300">Error</span>
        </header>
        <p className="text-sm text-rose-200">
          {(intentsQuery.error as Error).message ?? "Failed to load intents from the chain."}
        </p>
      </section>
    );
  }

  const intents = intentsQuery.data ?? [];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium text-slate-100">Intent Feed</h2>
          <p className="text-sm text-slate-400">
            Live view of trader intents stored in the IntentHub contract. Updates every 15 seconds.
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
          {intents.length} intents
        </span>
      </header>

      {intents.length === 0 ? (
        <p className="text-sm text-slate-500">
          No intents found yet. Submit an intent or wait for the listener service to register live auctions.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {intents.map((intent) => {
            const stateLabel = AUCTION_STATES[intent.state] ?? "Unknown";
            const isClosed = stateLabel !== "Open";

            return (
              <article
                key={intent.intentId.toString()}
                className={clsx(
                  "rounded-lg border p-4 shadow-lg transition",
                  isClosed ? "border-slate-800 bg-slate-900/50" : "border-emerald-700/70 bg-emerald-950/30",
                )}
              >
                <header className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Intent #{intent.intentId.toString()}</span>
                    <span className="font-mono text-xs text-slate-400">{intent.trader}</span>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      isClosed ? "bg-slate-500/20 text-slate-200" : "bg-emerald-500/20 text-emerald-200",
                    )}
                  >
                    {stateLabel}
                  </span>
                </header>

                <dl className="mt-4 space-y-2 text-sm text-slate-300">
                  {(() => {
                    const asset = assetMap.get(intent.settlementAsset.toLowerCase());
                    const amountFormatted = formatUnits(intent.amountIn, asset?.decimals ?? 18);
                    const minFormatted = formatUnits(intent.minAmountOut, asset?.decimals ?? 18);
                    const label = asset ? asset.symbol : "Token";
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <dt className="text-slate-400">Amount In</dt>
                          <dd>
                            {amountFormatted} {label}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-slate-400">Min Amount Out</dt>
                          <dd>
                            {minFormatted} {label}
                          </dd>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-400">Settlement Asset</dt>
                    <dd className="font-mono text-xs text-blue-300">{intent.settlementAsset}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-400">Recipient</dt>
                    <dd className="font-mono text-xs text-blue-300">{intent.recipient}</dd>
                  </div>
                </dl>

                <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-400">
                  <div>
                    <span className="block text-slate-500">Commit deadline</span>
                    <span>
                      {formatDistanceToNow(new Date(Number(intent.commitDeadline) * 1000), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Reveal deadline</span>
                    <span>
                      {formatDistanceToNow(new Date(Number(intent.revealDeadline) * 1000), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Execution deadline</span>
                    <span>
                      {formatDistanceToNow(new Date(Number(intent.executionDeadline) * 1000), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

