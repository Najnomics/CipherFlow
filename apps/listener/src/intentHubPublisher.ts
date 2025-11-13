import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, isAddress, zeroAddress, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import intentHubArtifact from "../../../out/IntentHub.sol/IntentHub.json" assert { type: "json" };
import intentRegistry from "../../../libs/intent-registry.json" assert { type: "json" };
import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";

import type { NormalizedIntent } from "./types.js";
import { IntentQueue } from "./queue.js";

interface IntentHubPublisherOptions {
  rpcUrl: string;
  intentHubAddress: `0x${string}`;
  privateKey: string;
  networkName?: string;
  commitWindowSeconds?: number;
  revealWindowSeconds?: number;
  executionWindowSeconds?: number;
  cachePath?: string;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

const ZERO_ADDRESS = zeroAddress;
const DEFAULT_COMMIT_WINDOW_SECONDS = 3600;
const DEFAULT_REVEAL_WINDOW_SECONDS = 60;
const DEFAULT_EXECUTION_WINDOW_SECONDS = 3600;
const DEFAULT_CACHE_PATH = resolve(process.cwd(), ".cache/listener-published.json");
const MAX_SCAN_INTENTS = 50n;

type IntentHubConfig = typeof intentHubArtifact.abi;

export class IntentHubPublisher {
  private readonly queue: IntentQueue;
  private readonly options: IntentHubPublisherOptions;
  private readonly publicClient;
  private readonly walletClient;
  private readonly account;
  private readonly networkConfig;
  private readonly published = new Set<string>();
  private readonly cachePath: string;
  private commitWindowSeconds: number;
  private revealWindowSeconds: number;
  private executionWindowSeconds: number;
  private escrowAddress: `0x${string}` | null = null;
  private readonly ready: Promise<void>;

  constructor(queue: IntentQueue, options: IntentHubPublisherOptions) {
    this.queue = queue;
    this.options = options;

    this.account = privateKeyToAccount(
      options.privateKey.startsWith("0x") ? (options.privateKey as `0x${string}`) : (`0x${options.privateKey}` as `0x${string}`),
    );

    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(options.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(options.rpcUrl),
    });

    this.networkConfig =
      (intentRegistry.networks as Array<{ name: string; blocklockSender?: string; settlementAssets: { symbol: string; address: string }[]; defaultCommitWindowSeconds?: number; defaultRevealDelayBlocks?: number; defaultExecutionWindowSeconds?: number }>).find(
        (network) => network.name === (options.networkName ?? "base-sepolia"),
      ) ?? null;

    this.commitWindowSeconds =
      options.commitWindowSeconds ?? this.networkConfig?.defaultCommitWindowSeconds ?? DEFAULT_COMMIT_WINDOW_SECONDS;

    const revealBlocks = this.networkConfig?.defaultRevealDelayBlocks ?? 1;
    this.revealWindowSeconds =
      options.revealWindowSeconds ?? (revealBlocks > 0 ? revealBlocks * 12 : DEFAULT_REVEAL_WINDOW_SECONDS);

    this.executionWindowSeconds =
      options.executionWindowSeconds ?? this.networkConfig?.defaultExecutionWindowSeconds ?? DEFAULT_EXECUTION_WINDOW_SECONDS;

    this.cachePath = options.cachePath ?? DEFAULT_CACHE_PATH;

    this.ready = this.initialize();
    this.queue.onIntent((intent) => {
      void this.ready.then(() => this.handleIntent(intent));
    });
  }

  private async initialize(): Promise<void> {
    await this.loadCache();
    this.escrowAddress = (await this.publicClient.readContract({
      address: this.options.intentHubAddress,
      abi: intentHubArtifact.abi as IntentHubConfig,
      functionName: "SETTLEMENT_ESCROW",
    })) as `0x${string}`;
  }

  private async handleIntent(intent: NormalizedIntent): Promise<void> {
    const key = `${intent.source}:${intent.externalId}`;
    if (this.published.has(key)) {
      return;
    }

    if (await this.intentAlreadyRegistered(intent.externalId)) {
      this.published.add(key);
      await this.saveCache();
      return;
    }

    try {
      const hash = await this.publishIntent(intent);
      this.published.add(key);
      await this.saveCache();
      this.options.logger?.("[listener] published intent", {
        externalId: intent.externalId,
        txHash: hash,
      });
    } catch (error) {
      this.options.logger?.("[listener] failed to publish intent", {
        externalId: intent.externalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async publishIntent(intent: NormalizedIntent): Promise<`0x${string}`> {
    const settlementAsset = this.resolveAsset(intent.fromToken);
    const recipient = this.resolveRecipient(intent.trader);
    const amountIn = intent.amountIn;
    const minAmountOut = intent.minAmountOut;

    const now = Math.floor(Date.now() / 1000);
    const commitDeadline = now + this.commitWindowSeconds;
    const revealDeadline = commitDeadline + this.revealWindowSeconds;
    const executionDeadline = revealDeadline + this.executionWindowSeconds;

    const extraDataPayload = {
      externalId: intent.externalId,
      source: intent.source,
      trader: intent.trader,
      metadata: intent.metadata,
      ingestedAt: Date.now(),
    };

    const extraData = stringToHex(JSON.stringify(extraDataPayload));

    if (settlementAsset !== ZERO_ADDRESS && this.escrowAddress) {
      const allowance = (await this.publicClient.readContract({
        address: settlementAsset,
        abi: erc20Abi,
        functionName: "allowance",
        args: [this.account.address, this.escrowAddress],
      })) as bigint;

      if (allowance < amountIn) {
        await this.walletClient.writeContract({
          address: settlementAsset,
          abi: erc20Abi,
          functionName: "approve",
          args: [this.escrowAddress, amountIn],
          account: this.account,
        });
      }
    }

    const txHash = await this.walletClient.writeContract({
      address: this.options.intentHubAddress,
      abi: intentHubArtifact.abi as IntentHubConfig,
      functionName: "createIntent",
      args: [
        {
          settlementAsset,
          recipient,
          amountIn,
          minAmountOut,
          commitDeadline: BigInt(commitDeadline),
          revealDeadline: BigInt(revealDeadline),
          executionDeadline: BigInt(executionDeadline),
          extraData,
        },
      ],
      account: this.account,
      value: settlementAsset === ZERO_ADDRESS ? amountIn : undefined,
    });

    return txHash;
  }

  private resolveAsset(token: string | undefined): `0x${string}` {
    if (!token) return ZERO_ADDRESS;
    if (isAddress(token)) return getAddress(token);
    const match = this.networkConfig?.settlementAssets?.find(
      (asset) => asset.symbol.toLowerCase() === token.toLowerCase(),
    );
    return match ? (getAddress(match.address) as `0x${string}`) : ZERO_ADDRESS;
  }

  private resolveRecipient(value: string | undefined): `0x${string}` {
    if (value && isAddress(value)) {
      return getAddress(value);
    }
    return this.account.address;
  }

  private async intentAlreadyRegistered(externalId: string): Promise<boolean> {
    const latestId = (await this.publicClient.readContract({
      address: this.options.intentHubAddress,
      abi: intentHubArtifact.abi as IntentHubConfig,
      functionName: "nextIntentId",
    })) as bigint;

    if (latestId === 0n) return false;

    let scanned = 0n;
    for (let id = latestId; id >= 1n && scanned < MAX_SCAN_INTENTS; id--, scanned++) {
      const intent = (await this.publicClient.readContract({
        address: this.options.intentHubAddress,
        abi: intentHubArtifact.abi as IntentHubConfig,
        functionName: "getIntent",
        args: [id],
      })) as any;

      const payload = decodeMetadata(intent.extraData as string | undefined);
      if (payload?.externalId === externalId) {
        return true;
      }
    }

    return false;
  }

  private async loadCache() {
    try {
      const raw = await fs.readFile(this.cachePath, "utf8");
      const entries = JSON.parse(raw) as string[];
      entries.forEach((entry) => this.published.add(entry));
    } catch {
      // ignore missing cache
    }
  }

  private async saveCache() {
    try {
      const values = Array.from(this.published.values());
      await fs.mkdir(dirname(this.cachePath), { recursive: true });
      await fs.writeFile(this.cachePath, JSON.stringify(values, null, 2), "utf8");
    } catch (error) {
      this.options.logger?.("[listener] failed to persist publisher cache", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function decodeMetadata(extraData: string | undefined): Record<string, unknown> | undefined {
  if (!extraData || extraData === "0x") {
    return undefined;
  }

  try {
    const bytes = Buffer.from(extraData.slice(2), "hex");
    if (bytes.length === 0) return undefined;
    const decoded = JSON.parse(bytes.toString("utf8"));
    if (decoded && typeof decoded === "object") {
      return decoded as Record<string, unknown>;
    }
  } catch {
    // ignore malformed metadata
  }
  return undefined;
}


