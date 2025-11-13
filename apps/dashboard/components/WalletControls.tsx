"use client";

import { useMemo } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";

function truncate(value: `0x${string}`) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function WalletControls() {
  const { address, isConnected, chainId, status } = useAccount();
  const { connect, connectors, error: connectError, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, status: switchStatus } = useSwitchChain();

  const primaryConnector = useMemo(() => connectors.find((connector) => connector.ready), [connectors]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => primaryConnector && connect({ connector: primaryConnector })}
          className="rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
          disabled={!primaryConnector || connectStatus === "pending"}
        >
          {connectStatus === "pending" ? "Connecting…" : "Connect Wallet"}
        </button>
        {connectError && <span className="text-xs text-rose-300">{connectError.message}</span>}
      </div>
    );
  }

  const isWrongNetwork = chainId !== baseSepolia.id;

  return (
    <div className="flex flex-col items-end gap-2 text-sm text-slate-300">
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 font-mono text-xs text-slate-100">
          {address ? truncate(address) : "Connected"}
        </span>
        <button
          onClick={() => disconnect()}
          className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-400 hover:text-white"
        >
          Disconnect
        </button>
      </div>
      {isWrongNetwork && (
        <div className="flex items-center gap-3 text-xs text-amber-300">
          <span>Switch to Base Sepolia</span>
          <button
            onClick={() => switchChain({ chainId: baseSepolia.id })}
            disabled={switchStatus === "pending"}
            className="rounded border border-amber-400 px-2 py-1 text-xs transition hover:bg-amber-400/20 disabled:opacity-60"
          >
            {switchStatus === "pending" ? "Switching…" : "Switch network"}
          </button>
        </div>
      )}
      {status === "reconnecting" && <span className="text-xs text-slate-500">Reconnecting…</span>}
    </div>
  );
}

