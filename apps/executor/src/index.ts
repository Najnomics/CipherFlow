import "dotenv/config";
import { zeroAddress, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { ProfitReport, QuoteLeg, SwapIntentDefinition } from "@cipherflow/markets";
import { ExecutionService } from "./executionService.js";
import intentHubArtifact from "../../../out/IntentHub.sol/IntentHub.json" assert { type: "json" };

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const envSchema = z
  .object({
    BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
    RPC_URL: z.string().url().optional(),
    INTENT_HUB_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    EXECUTOR_PRIVATE_KEY: z.string().min(32).optional(),
    CHAIN_ID: z.coerce.number().int().positive().optional(),
    POLL_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (value) => Boolean(value.BASE_SEPOLIA_RPC_URL ?? value.RPC_URL),
    "RPC URL required (BASE_SEPOLIA_RPC_URL or RPC_URL)",
  );

const env = envSchema.parse(process.env);
const rpcUrl = env.BASE_SEPOLIA_RPC_URL ?? env.RPC_URL!;
const pollIntervalMs = env.POLL_INTERVAL_MS ?? 20_000;

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

const account =
  env.EXECUTOR_PRIVATE_KEY !== undefined
    ? privateKeyToAccount(
        env.EXECUTOR_PRIVATE_KEY.startsWith("0x")
          ? (env.EXECUTOR_PRIVATE_KEY as Hex)
          : (`0x${env.EXECUTOR_PRIVATE_KEY}` as Hex),
      )
    : undefined;

const walletClient =
  account !== undefined
    ? createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(rpcUrl),
      })
    : undefined;

const executionService = new ExecutionService({
  rpcUrl,
  chainId: env.CHAIN_ID ?? baseSepolia.id,
  logger: (message, meta) => {
    if (meta) {
      console.log(message, meta);
      return;
    }
    console.log(message);
  },
});

const intentHubAddress = env.INTENT_HUB_ADDRESS as `0x${string}`;
const intentHubAbi = intentHubArtifact.abi;

const processedCommitments = new Set<string>();
const processingCommitments = new Map<bigint, Promise<void>>();

async function main() {
  console.log("[executor] booting", { rpcUrl, intentHub: env.INTENT_HUB_ADDRESS });

  await bootstrapRevealReadyCommitments();

  const unwatch = publicClient.watchContractEvent({
    address: intentHubAddress,
    abi: intentHubAbi,
    eventName: "CommitmentRevealed",
    pollingInterval: pollIntervalMs,
    onLogs: (logs) => {
      for (const log of logs) {
        const commitmentId = log.args?.commitmentId as bigint | undefined;
        const intentId = log.args?.intentId as bigint | undefined;
        if (commitmentId !== undefined) {
          console.log("[executor] observed CommitmentRevealed", {
            commitmentId: commitmentId.toString(),
            intentId: intentId?.toString(),
          });
          scheduleCommitment(commitmentId, intentId);
        }
      }
    },
  });

  const pollTimer = setInterval(async () => {
    try {
      const reveals = await collectRevealReadyCommitments();
      reveals.forEach(({ commitmentId, intentId }) => scheduleCommitment(commitmentId, intentId));
    } catch (error) {
      console.error("[executor] poll error", error);
    }
  }, pollIntervalMs);

  process.on("SIGINT", () => {
    console.log("[executor] shutting down");
    unwatch();
    clearInterval(pollTimer);
    process.exit(0);
  });
}

function scheduleCommitment(commitmentId: bigint, intentId?: bigint) {
  if (processedCommitments.has(commitmentId.toString()) || processingCommitments.has(commitmentId)) {
    return;
  }
  const job = processCommitment(commitmentId, intentId).finally(() => {
    processingCommitments.delete(commitmentId);
  });
  processingCommitments.set(commitmentId, job);
}

async function processCommitment(commitmentId: bigint, hintedIntentId?: bigint) {
  try {
    const record = (await publicClient.readContract({
      address: intentHubAddress,
      abi: intentHubAbi,
      functionName: "getCommitment",
      args: [commitmentId],
    })) as any;

    const intentId: bigint =
      hintedIntentId ?? BigInt(record.intentId ?? 0n);

    if (intentId === 0n) {
      console.warn("[executor] commitment missing intent id", { commitmentId: commitmentId.toString() });
      return;
    }

    const intent = (await publicClient.readContract({
      address: intentHubAddress,
      abi: intentHubAbi,
      functionName: "getIntent",
      args: [intentId],
    })) as any;

    const payloadHex = (record.reveal?.decryptedPayload ?? "0x") as Hex;
    const decodedPayload = decodeRevealPayload(payloadHex);
    const metadata = {
      ...decodedPayload,
      ...decodeIntentMetadata(intent.extraData as string | undefined),
    };

    const amountIn = BigInt(intent.amountIn ?? metadata.ain ?? 0);
    const minAmountOut = BigInt(intent.minAmountOut ?? metadata.min ?? 0);
    const expectedAmountOut = BigInt(metadata?.aout ?? minAmountOut);
    const gasEstimate = BigInt(metadata?.g ?? 150_000n);
    const bridgeFee = BigInt(metadata?.bf ?? 0);
    const venue = (metadata?.v as string | undefined) ?? "unknown";

    const definition: SwapIntentDefinition = {
      intentId,
      fromToken:
        (metadata?.fromToken as string | undefined) ??
        (intent.settlementAsset as string | undefined) ??
        zeroAddress,
      toToken:
        (metadata?.toToken as string | undefined) ??
        (intent.settlementAsset as string | undefined) ??
        zeroAddress,
      amountIn,
      minAmountOut,
      sourceChainId: (metadata?.sourceChainId as number | undefined) ?? baseSepolia.id,
      destinationChainId: metadata?.destinationChainId as number | undefined,
      metadata,
    };

    const report: ProfitReport = {
      venue,
      amountOut: expectedAmountOut,
      amountIn,
      gasCost: gasEstimate * 25n * 10n ** 9n,
      bridgeFee,
      netProfit: expectedAmountOut - amountIn - bridgeFee,
      quoteIssuedAt: (metadata?.t as number | undefined) ?? Date.now(),
      warnings: [],
    };

    const leg: QuoteLeg = {
      venue,
      chainId: definition.destinationChainId ?? definition.sourceChainId ?? baseSepolia.id,
      expectedAmountOut,
      gasEstimate,
      target: zeroAddress,
      callData: "0x" as Hex,
      bridgeFee,
      context: { payload: metadata },
    };

    await executionService.execute(definition, report, leg);

    if (walletClient) {
      await walletClient.writeContract({
        address: intentHubAddress,
        abi: intentHubAbi,
        functionName: "recordExecution",
        args: [commitmentId, report.amountOut, 0n, ZERO_HASH, true],
      });
      console.log("[executor] recorded execution on-chain", {
        commitmentId: commitmentId.toString(),
        amountOut: report.amountOut.toString(),
      });
    } else {
      console.log("[executor] execution simulated (no wallet configured)", {
        commitmentId: commitmentId.toString(),
      });
    }

    processedCommitments.add(commitmentId.toString());
  } catch (error) {
    console.error("[executor] failed to process commitment", {
      commitmentId: commitmentId.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function collectRevealReadyCommitments(limit = 20): Promise<Array<{ commitmentId: bigint; intentId: bigint }>> {
  const nextCommitmentId = (await publicClient.readContract({
    address: intentHubAddress,
    abi: intentHubAbi,
    functionName: "nextCommitmentId",
  })) as bigint;

  if (nextCommitmentId === 0n) {
    return [];
  }

  const results: Array<{ commitmentId: bigint; intentId: bigint }> = [];

  let scanned = 0n;
  for (let id = nextCommitmentId; id >= 1n && scanned < MAX_COMMITMENT_SCAN; id--, scanned++) {
    const record = (await publicClient.readContract({
      address: intentHubAddress,
      abi: intentHubAbi,
      functionName: "getCommitment",
      args: [id],
    })) as any;

    const state = Number(record.commitment.state ?? 0);
    if (state === 2) {
      const intentId = BigInt(record.intentId ?? 0n);
      results.push({ commitmentId: id, intentId });
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results;
}

async function bootstrapRevealReadyCommitments() {
  const reveals = await collectRevealReadyCommitments();
  reveals.forEach(({ commitmentId, intentId }) => scheduleCommitment(commitmentId, intentId));
}

function decodeRevealPayload(payload: Hex): Record<string, unknown> | undefined {
  if (!payload || payload === "0x") {
    return undefined;
  }

  try {
    const bytes = Buffer.from(payload.slice(2), "hex");
    if (bytes.length === 0) {
      return undefined;
    }
    const decoded = JSON.parse(bytes.toString("utf8"));
    if (decoded && typeof decoded === "object") {
      return decoded as Record<string, unknown>;
    }
  } catch (error) {
    console.warn("[executor] unable to decode reveal payload", error);
  }

  return undefined;
}

function decodeIntentMetadata(extraData: string | undefined): Record<string, unknown> | undefined {
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
  } catch (error) {
    console.warn("[executor] unable to decode intent metadata", error);
  }

  return undefined;
}

const MAX_COMMITMENT_SCAN = 25n;

void main().catch((error) => {
  console.error("[executor] fatal error", error);
  process.exitCode = 1;
});

