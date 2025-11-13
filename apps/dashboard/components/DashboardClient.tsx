"use client";

import { useMemo } from "react";
import { WalletControls } from "./WalletControls";
import { CreateIntentForm } from "./CreateIntentForm";
import { IntentFeed } from "./IntentFeed";
import type { DashboardConfig, DashboardNetworkConfig } from "../types";

interface DashboardClientProps {
  config: DashboardConfig;
}

export function DashboardClient({ config }: DashboardClientProps) {
  const baseNetwork = useMemo<DashboardNetworkConfig | undefined>(
    () => config.networks.find((network) => network.name === "base-sepolia") ?? config.networks[0],
    [config.networks],
  );

  const intentHubAddress = config.intentHubAddress;

  return (
    <main className="min-h-screen px-6 py-10 space-y-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-blue-400">
            CipherFlow · BlockLock sealed solver network · Base Sepolia
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Intent Control Center</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Submit sealed intents directly to the on-chain `IntentHub` contract, monitor auction windows, and keep solver
            collateralised without exposing your strategy to copy-traders.
          </p>
        </div>
        <WalletControls />
      </header>

      {baseNetwork ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <CreateIntentForm intentHubAddress={intentHubAddress} network={baseNetwork} />
          <div className="space-y-6">
            <IntentFeed intentHubAddress={intentHubAddress} assets={baseNetwork.settlementAssets} />
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-3">
              <h3 className="text-lg font-medium text-slate-100">Contract Addresses</h3>
              <dl className="space-y-2 text-sm text-slate-300">
                <div className="flex flex-col">
                  <dt className="text-slate-500">IntentHub</dt>
                  <dd className="font-mono text-xs text-blue-300 break-all">{config.intentHubAddress}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-slate-500">SettlementEscrow</dt>
                  <dd className="font-mono text-xs text-blue-300 break-all">{config.settlementEscrowAddress}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-slate-500">Supported assets</dt>
                  <dd className="text-xs text-slate-400">
                    {baseNetwork.settlementAssets
                      .map((asset) => `${asset.symbol} (${asset.address})`)
                      .join(" · ")}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      ) : (
        <section className="rounded-xl border border-rose-800 bg-rose-950/60 p-6 text-sm text-rose-200">
          <p className="font-semibold text-rose-100">Network configuration missing</p>
          <p className="mt-2">
            No network entry for Base Sepolia in `libs/intent-registry.json`. Add one to enable intent creation.
          </p>
        </section>
      )}
    </main>
  );
}

