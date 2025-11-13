"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits, stringToHex, zeroAddress } from "viem";
import { baseSepolia } from "wagmi/chains";
import clsx from "clsx";

import { intentHubAbi } from "../lib/contracts";
import type { DashboardNetworkConfig } from "../types";

type SettlementAsset = DashboardNetworkConfig["settlementAssets"][number];

interface CreateIntentFormProps {
  intentHubAddress: `0x${string}`;
  network: DashboardNetworkConfig;
}

function truncateAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const ONE_MINUTE = 60;

export function CreateIntentForm({ intentHubAddress, network }: CreateIntentFormProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [selectedAsset, setSelectedAsset] = useState<SettlementAsset>(() => network.settlementAssets[0]);
  const [amountIn, setAmountIn] = useState("");
  const [minAmountOut, setMinAmountOut] = useState("");
  const [recipient, setRecipient] = useState<`0x${string}` | "">("");
  const [commitWindowSeconds, setCommitWindowSeconds] = useState(
    String(network.defaultCommitWindowSeconds ?? ONE_MINUTE * 10),
  );
  const [revealWindowSeconds, setRevealWindowSeconds] = useState(String(ONE_MINUTE * 5));
  const [executionWindowSeconds, setExecutionWindowSeconds] = useState(
    String(network.defaultExecutionWindowSeconds ?? ONE_MINUTE * 15),
  );
  const [extraData, setExtraData] = useState("");

  const [approvalHash, setApprovalHash] = useState<`0x${string}` | null>(null);
  const [intentHash, setIntentHash] = useState<`0x${string}` | null>(null);

  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const decimals = selectedAsset.decimals;
  const parsedAmountIn = useMemo(() => {
    if (!amountIn) return 0n;
    try {
      return parseUnits(amountIn, decimals);
    } catch {
      return 0n;
    }
  }, [amountIn, decimals]);

  const parsedMinAmountOut = useMemo(() => {
    if (!minAmountOut) return 0n;
    try {
      return parseUnits(minAmountOut, decimals);
    } catch {
      return 0n;
    }
  }, [minAmountOut, decimals]);

  const isNativeAsset = selectedAsset.address === zeroAddress;

  const allowanceQuery = useReadContract({
    address: selectedAsset.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, intentHubAddress] : undefined,
    query: {
      enabled: Boolean(address && !isNativeAsset && parsedAmountIn > 0n),
    },
  });

  const needsApproval =
    !isNativeAsset &&
    parsedAmountIn > 0n &&
    (allowanceQuery.data === undefined || (allowanceQuery.data as bigint) < parsedAmountIn);

  const { refetch: refetchAllowance } = allowanceQuery;

  const approvalReceipt = useWaitForTransactionReceipt({
    hash: approvalHash ?? undefined,
    query: { enabled: Boolean(approvalHash) },
  });

  useEffect(() => {
    if (approvalReceipt.data?.status === "success") {
      refetchAllowance();
    }
  }, [approvalReceipt.data?.status, refetchAllowance]);

  const intentReceipt = useWaitForTransactionReceipt({
    hash: intentHash ?? undefined,
    query: { enabled: Boolean(intentHash) },
  });

  useEffect(() => {
    if (intentReceipt.data?.status === "success") {
      setAmountIn("");
      setMinAmountOut("");
      setExtraData("");
      setIntentHash(null);
    }
  }, [intentReceipt.data?.status]);

  async function handleApprove() {
    if (!address || isNativeAsset || parsedAmountIn === 0n) return;
    const hash = await writeContractAsync({
      address: selectedAsset.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [intentHubAddress, parsedAmountIn],
      chain: baseSepolia,
    });
    setApprovalHash(hash);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;

    const now = Math.floor(Date.now() / 1000);
    const commitDeadline = BigInt(now + Number(commitWindowSeconds || "0"));
    const revealDeadline = commitDeadline + BigInt(Number(revealWindowSeconds || "0"));
    const executionDeadline = revealDeadline + BigInt(Number(executionWindowSeconds || "0"));

    const payload = {
      settlementAsset: selectedAsset.address as `0x${string}`,
      recipient: (recipient || address) as `0x${string}`,
      amountIn: parsedAmountIn,
      minAmountOut: parsedMinAmountOut > 0n ? parsedMinAmountOut : parsedAmountIn,
      commitDeadline,
      revealDeadline,
      executionDeadline,
      extraData: extraData ? stringToHex(extraData) : "0x",
    } as const;

    const hash = await writeContractAsync({
      address: intentHubAddress,
      abi: intentHubAbi,
      functionName: "createIntent",
      args: [payload],
      value: isNativeAsset ? parsedAmountIn : undefined,
      chain: baseSepolia,
    });
    setIntentHash(hash);

    if (publicClient) {
      // optimistic update for allowance check
      setTimeout(() => void refetchAllowance(), 3000);
    }
  }

  const formDisabled =
    !isConnected ||
    chainId !== baseSepolia.id ||
    parsedAmountIn === 0n ||
    Number(commitWindowSeconds || "0") <= 0 ||
    Number(revealWindowSeconds || "0") <= 0 ||
    Number(executionWindowSeconds || "0") <= 0;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-100">Create Intent</h2>
        <p className="text-sm text-slate-400">Lock funds in the escrow and define solver execution parameters.</p>
      </header>

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-slate-400">Settlement Asset</span>
          <select
            value={selectedAsset.symbol}
            onChange={(event) => {
              const asset = network.settlementAssets.find((item) => item.symbol === event.target.value);
              if (asset) setSelectedAsset(asset);
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {network.settlementAssets.map((asset) => (
              <option key={asset.symbol} value={asset.symbol}>
                {asset.symbol} {asset.address === zeroAddress ? "(Native)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-slate-400">Amount In</span>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={amountIn}
              onChange={(event) => setAmountIn(event.target.value)}
              placeholder="0.0"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-slate-400">Minimum Amount Out</span>
            <input
              type="number"
              min="0"
              step="any"
              value={minAmountOut}
              onChange={(event) => setMinAmountOut(event.target.value)}
              placeholder="Optional (defaults to Amount In)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-slate-400">Recipient</span>
          <input
            type="text"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value as `0x${string}`)}
            placeholder={address ? truncateAddress(address) : "0x..."}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-500">Defaults to your connected address.</span>
        </label>

        <fieldset className="grid gap-4 md:grid-cols-3">
          <legend className="text-sm text-slate-400">Deadlines</legend>
          <label className="block space-y-2">
            <span className="text-xs text-slate-500">Commit Window (seconds)</span>
            <input
              type="number"
              min="60"
              value={commitWindowSeconds}
              onChange={(event) => setCommitWindowSeconds(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs text-slate-500">Reveal Window (seconds)</span>
            <input
              type="number"
              min="60"
              value={revealWindowSeconds}
              onChange={(event) => setRevealWindowSeconds(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs text-slate-500">Execution Window (seconds)</span>
            <input
              type="number"
              min="120"
              value={executionWindowSeconds}
              onChange={(event) => setExecutionWindowSeconds(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </fieldset>

        <label className="block space-y-2">
          <span className="text-sm text-slate-400">Notes / Extra Data</span>
          <textarea
            value={extraData}
            onChange={(event) => setExtraData(event.target.value)}
            rows={3}
            placeholder="Optional memo for solvers (stored as bytes)."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-400">
        <div className="flex items-center justify-between">
          <span>Network</span>
          <span>{network.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>IntentHub</span>
          <span className="font-mono text-xs text-blue-400">{intentHubAddress}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Selected Asset</span>
          <span>
            {selectedAsset.symbol} ·{" "}
            <span className="font-mono text-xs text-blue-400">
              {selectedAsset.address === zeroAddress ? "native" : selectedAsset.address}
            </span>
          </span>
        </div>
        {parsedAmountIn > 0n && (
          <div className="flex items-center justify-between">
            <span>Amount In (wei)</span>
            <span className="font-mono text-xs text-blue-400">{parsedAmountIn.toString()}</span>
          </div>
        )}
      </div>

      {!isConnected && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Connect your wallet to create an intent.
        </p>
      )}

      {isConnected && chainId !== baseSepolia.id && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Please switch to Base Sepolia before submitting.
        </p>
      )}

      {!isNativeAsset && needsApproval && (
        <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-200 space-y-2">
          <p>
            Approve IntentHub to transfer {amountIn || "0"} {selectedAsset.symbol} on your behalf.
          </p>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isWriting || parsedAmountIn === 0n}
            className={clsx(
              "w-full rounded-lg border border-blue-500 bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500",
              isWriting && "opacity-60",
            )}
          >
            {isWriting ? "Confirm in wallet…" : "Grant Approval"}
          </button>

          {approvalReceipt.data && (
            <p className="text-xs text-blue-300">
              Approval tx:{" "}
              <a
                href={`https://sepolia.basescan.org/tx/${approvalReceipt.data.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {truncateAddress(approvalReceipt.data.transactionHash)}
              </a>
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={formDisabled || isWriting || (!isNativeAsset && needsApproval)}
        className={clsx(
          "w-full rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500",
          (formDisabled || isWriting || (!isNativeAsset && needsApproval)) && "cursor-not-allowed opacity-60",
        )}
      >
        {isWriting
          ? "Waiting for wallet…"
          : !isNativeAsset && needsApproval
            ? "Approve tokens first"
            : "Submit Intent"}
      </button>

      {intentReceipt.data && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <p className="font-medium text-emerald-200">Intent submitted!</p>
          <p className="text-xs">
            Tx:{" "}
            <a
              href={`https://sepolia.basescan.org/tx/${intentReceipt.data.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {truncateAddress(intentReceipt.data.transactionHash)}
            </a>
          </p>
        </div>
      )}
    </form>
  );
}

