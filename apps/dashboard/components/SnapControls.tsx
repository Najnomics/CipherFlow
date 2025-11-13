"use client";

import { useAccount } from "wagmi";
import { useCallback, useEffect, useMemo, useState } from "react";

type SnapMetadata = {
  id: string;
  enabled: boolean;
  version: string;
};

type InstalledSnaps = Record<string, SnapMetadata>;

interface SnapControlsProps {
  snapId: string;
  baseRpcUrl: string;
  intentHubAddress: `0x${string}`;
  settlementEscrowAddress: `0x${string}`;
  blocklockSender: `0x${string}`;
  collateralWei: string;
}

function findSnap(snaps: InstalledSnaps | undefined, snapId: string): SnapMetadata | null {
  if (!snaps) return null;
  if (snapId in snaps) return snaps[snapId];
  const match = Object.values(snaps).find((snap) => snap.id === snapId);
  return match ?? null;
}

export function SnapControls({
  snapId,
  baseRpcUrl,
  intentHubAddress,
  settlementEscrowAddress,
  blocklockSender,
  collateralWei,
}: SnapControlsProps) {
  const { isConnected } = useAccount();
  const [hasProvider, setHasProvider] = useState(false);
  const [isFlask, setIsFlask] = useState(false);
  const [snapInfo, setSnapInfo] = useState<SnapMetadata | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const statusLabel = useMemo(() => {
    if (!hasProvider) return "Wallet not detected";
    if (!isFlask) return "Requires MetaMask Flask";
    if (snapInfo) return "Snap connected";
    return "Snap not installed";
  }, [hasProvider, isFlask, snapInfo]);

  const statusTone = useMemo(() => {
    if (!hasProvider) return "border-rose-800 text-rose-200";
    if (!isFlask) return "border-amber-600 text-amber-200";
    if (snapInfo) return "border-emerald-600 text-emerald-200";
    return "border-slate-600 text-slate-200";
  }, [hasProvider, isFlask, snapInfo]);

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIsChecking(true);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        setHasProvider(false);
        setIsFlask(false);
        setSnapInfo(null);
        setError(null);
        return;
      }

      setHasProvider(true);
      const flask = Boolean(ethereum.isFlask);
      setIsFlask(flask);

      if (!flask) {
        setSnapInfo(null);
        return;
      }

      const snaps = (await ethereum.request({
        method: "wallet_getSnaps",
      })) as InstalledSnaps;

      setSnapInfo(findSnap(snaps, snapId));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to enumerate installed snaps.");
    } finally {
      setIsChecking(false);
    }
  }, [snapId]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const connectSnap = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    setIsConnecting(true);
    setError(null);

    try {
      await ethereum.request({
        method: "wallet_requestSnaps",
        params: {
          [snapId]: {},
        },
      });

      await checkStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to install CipherFlow snap.");
    } finally {
      setIsConnecting(false);
    }
  }, [checkStatus, snapId]);

  const syncConfig = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    setIsSyncing(true);
    setError(null);

    try {
      await ethereum.request({
        method: "wallet_invokeSnap",
        params: {
          snapId,
          request: {
            method: "cipherflow_setConfig",
            params: {
              baseRpcUrl,
              intentHubAddress,
              settlementEscrowAddress,
              blocklockSender,
              collateralWei,
            },
          },
        },
      });

      setLastSyncedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to sync dashboard config to the snap.");
    } finally {
      setIsSyncing(false);
      void checkStatus();
    }
  }, [
    baseRpcUrl,
    blocklockSender,
    checkStatus,
    collateralWei,
    intentHubAddress,
    settlementEscrowAddress,
    snapId,
  ]);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    const deltaMs = Date.now() - lastSyncedAt;
    if (deltaMs < 5_000) return "Synced just now";
    if (deltaMs < 60_000) return "Synced less than a minute ago";
    const minutes = Math.floor(deltaMs / 60_000);
    return `Synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }, [lastSyncedAt]);

  const canInstall = hasProvider && isFlask;
  const canSync = canInstall && snapInfo && isConnected && !isChecking;

  return (
    <div className="flex w-full flex-col items-end gap-2 text-xs text-slate-400">
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-3 py-1 font-medium ${statusTone}`}>
          {isChecking ? "Checking snap…" : statusLabel}
        </span>
        {snapInfo?.version && (
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
            v{snapInfo.version}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={connectSnap}
          disabled={!canInstall || isConnecting}
          className="rounded-md border border-blue-500 bg-blue-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-400"
        >
          {isConnecting ? "Requesting…" : snapInfo ? "Reinstall Snap" : "Install Snap"}
        </button>
        <button
          type="button"
          onClick={syncConfig}
          disabled={!canSync || isSyncing}
          className="rounded-md border border-emerald-500 px-3 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
        >
          {isSyncing ? "Syncing…" : "Sync Snap Config"}
        </button>
      </div>

      {!hasProvider && (
        <p className="max-w-xs text-right text-[11px] text-rose-300">
          Install MetaMask Flask and enable developer mode to preview CipherFlow intents in-wallet.
        </p>
      )}
      {hasProvider && !isFlask && (
        <p className="max-w-xs text-right text-[11px] text-amber-300">
          Detected MetaMask, but not the Flask developer build. Switch to Flask to run the local snap.
        </p>
      )}
      {lastSyncedLabel && <p className="text-[11px] text-emerald-200">{lastSyncedLabel}</p>}
      {error && <p className="max-w-xs text-right text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}


