import "dotenv/config";
import { zeroAddress } from "viem";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { createDefaultConnectors, type SwapIntentDefinition, type QuoteConnector } from "@cipherflow/markets";
import { RoutePlanner } from "./routePlanner.js";
import { Blocklock, encodeCiphertextToSolidity, encodeCondition } from "blocklock-js";
import { ethers } from "ethers";
import intentHubArtifact from "../../../out/IntentHub.sol/IntentHub.json" assert { type: "json" };

interface SolverTelemetryEntry {
  id: string;
  intentId: string;
  venue: string;
  venueLabel?: string;
  amountIn: string;
  amountOut: string;
  gasCost: string;
  bridgeFee: string;
  netProfit: string;
  timestamp: number;
  status: "planned" | "committed" | "failed";
  txHash?: string;
  warnings?: string[];
  error?: string;
}

const TELEMETRY_FILE_PATH = resolve(
  process.cwd(),
  process.env.SOLVER_TELEMETRY_FILE ?? "../.cache/solver-telemetry.json",
);

async function recordTelemetry(entry: SolverTelemetryEntry) {
  try {
    await fs.mkdir(dirname(TELEMETRY_FILE_PATH), { recursive: true });
    let existing: SolverTelemetryEntry[] = [];
    try {
      const raw = await fs.readFile(TELEMETRY_FILE_PATH, "utf8");
      existing = JSON.parse(raw) as SolverTelemetryEntry[];
    } catch {}
    existing.unshift(entry);
    if (existing.length > 50) {
      existing = existing.slice(0, 50);
    }
    await fs.writeFile(TELEMETRY_FILE_PATH, JSON.stringify(existing, null, 2), "utf8");
  } catch (error) {
    console.warn("[solver] telemetry write failed", error);
  }
}

const configSchema = z.object({
  BASE_SEPOLIA_RPC_URL: z.string().url(),
  SOLVER_PRIVATE_KEY: z.string().min(32),
  INTENT_HUB_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  SOLVER_COLLATERAL_WEI: z.string().regex(/^\d+$/).transform((v) => BigInt(v)),
  GAS_PRICE_GWEI: z.coerce.number().positive().optional(),
  BLOCKLOCK_CALLBACK_GAS_LIMIT: z.coerce.number().int().positive().optional(),
  BLOCKLOCK_API_KEY: z.string().optional(),
  BLOCKLOCK_SUBSCRIPTION_ID: z.string().optional(),
  BLOCKLOCK_ENCRYPTION_ENDPOINT: z.string().optional(),
  BLOCKLOCK_BUFFER_PERCENT: z.coerce.number().int().nonnegative().optional(),
  AERODROME_API_URL: z.string().url().optional(),
  UNISWAP_API_URL: z.string().url().optional(),
  CURVE_API_URL: z.string().url().optional(),
  MOCK_BRIDGE_CONFIG: z.string().optional(),
  SOLVER_TARGET_INTENT_ID: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => BigInt(value))
    .optional(),
  SOLVER_SOURCE_CHAIN_ID: z.coerce.number().int().positive().optional(),
  SOLVER_DESTINATION_CHAIN_ID: z.coerce.number().int().positive().optional(),
  SOLVER_FROM_TOKEN_OVERRIDE: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  SOLVER_TO_TOKEN_OVERRIDE: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  PLANNER_DISABLE_LIVE: z.coerce.boolean().optional(),
});

const env = configSchema.parse(process.env);

const gasPriceWei = env.GAS_PRICE_GWEI ? BigInt(Math.round(env.GAS_PRICE_GWEI * 1e9)) : undefined;
const callbackGasLimit = BigInt(env.BLOCKLOCK_CALLBACK_GAS_LIMIT ?? 300_000);

const provider = new ethers.JsonRpcProvider(env.BASE_SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(
  env.SOLVER_PRIVATE_KEY.startsWith("0x") ? env.SOLVER_PRIVATE_KEY : `0x${env.SOLVER_PRIVATE_KEY}`,
  provider,
);
const intentHub = new ethers.Contract(env.INTENT_HUB_ADDRESS, intentHubArtifact.abi, wallet);

const blocklock = Blocklock.createBaseSepolia(wallet);

const connectors: QuoteConnector[] = createDefaultConnectors({
  aerodrome: { apiUrl: env.AERODROME_API_URL },
  uniswap: { apiUrl: env.UNISWAP_API_URL },
  curve: { apiUrl: env.CURVE_API_URL },
  mockBridge: env.MOCK_BRIDGE_CONFIG ? JSON.parse(env.MOCK_BRIDGE_CONFIG) : undefined,
});

const routePlanner = new RoutePlanner({
  connectors: connectors,
  gasPriceWei,
  logger: (message, meta) => {
    if (meta) {
      console.log(message, meta);
      return;
    }
    console.log(message);
  },
});

async function submitCommitment(intent: SwapIntentDefinition) {
  const report = await routePlanner.planBestRoute(intent);
  if (!report) {
    console.warn("[solver] no profitable routes discovered");
    return;
  }

  const telemetryBase = {
    id: randomUUID(),
    intentId: intent.intentId.toString(),
    venue: report.venue,
    amountIn: intent.amountIn.toString(),
    amountOut: report.amountOut.toString(),
    gasCost: report.gasCost.toString(),
    bridgeFee: report.bridgeFee.toString(),
    netProfit: report.netProfit.toString(),
  } satisfies Omit<SolverTelemetryEntry, "status" | "timestamp">;

  const liveDisabled = env.PLANNER_DISABLE_LIVE ?? false;
  if (liveDisabled) {
    console.log("[solver] planning only (PLANNER_DISABLE_LIVE=true)", {
      intentId: intent.intentId.toString(),
      venue: report.venue,
      netProfit: report.netProfit.toString(),
    });
    return;
  }

  await recordTelemetry({
    ...telemetryBase,
    timestamp: Date.now(),
    status: "planned",
  });

  const payload = {
    i: intent.intentId.toString(),
    s: wallet.address,
    v: report.venue,
    ain: intent.amountIn.toString(),
    min: intent.minAmountOut.toString(),
    aout: report.amountOut.toString(),
    g: report.gasCost.toString(),
    bf: report.bridgeFee.toString(),
    t: Date.now(),
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (payloadBytes.length > 256) {
    const error = new Error("payload exceeds BlockLock 256-byte limit");
    await recordTelemetry({
      ...telemetryBase,
      timestamp: Date.now(),
      status: "failed",
      error: error.message,
    });
    throw error;
  }

  try {
    const latestBlock = await provider.getBlockNumber();
    const targetBlock = BigInt(latestBlock + 1);
    const conditionBytes = encodeCondition(targetBlock);

    const ciphertext = blocklock.encrypt(payloadBytes, targetBlock);
    const encodedCiphertext = encodeCiphertextToSolidity(ciphertext);
    const solidityCiphertext = {
      u: {
        x: [encodedCiphertext.u.x[0], encodedCiphertext.u.x[1]],
        y: [encodedCiphertext.u.y[0], encodedCiphertext.u.y[1]],
      },
      v: ethers.hexlify(encodedCiphertext.v),
      w: ethers.hexlify(encodedCiphertext.w),
    };

    const payloadHash = ethers.keccak256(payloadBytes);

    const txn = await intentHub.commitToIntent(
      intent.intentId,
      payloadHash,
      solidityCiphertext,
      conditionBytes,
      callbackGasLimit,
      env.SOLVER_COLLATERAL_WEI,
      {
        value: env.SOLVER_COLLATERAL_WEI,
      },
    );

    const receipt = await txn.wait();
    console.log("[solver] commitment submitted", {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
    });

    await recordTelemetry({
      ...telemetryBase,
      timestamp: Date.now(),
      status: "committed",
      txHash: receipt?.hash,
    });
  } catch (error) {
    await recordTelemetry({
      ...telemetryBase,
      timestamp: Date.now(),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function main() {
  console.log("[solver] booting", { rpc: env.BASE_SEPOLIA_RPC_URL, intentHub: env.INTENT_HUB_ADDRESS });

  const intentDefinition = await resolveIntentDefinition();

  await submitCommitment(intentDefinition);
}

void main().catch((error) => {
  console.error("[solver] fatal error", error);
  process.exitCode = 1;
});

const DEFAULT_CHAIN_ID = 84532;
const MAX_INTENT_SCAN = 25n;

async function resolveIntentDefinition(): Promise<SwapIntentDefinition> {
  const targetIntentId = env.SOLVER_TARGET_INTENT_ID ?? (await findOpenIntentId());
  if (targetIntentId === undefined) {
    throw new Error(
      "No open intents found on-chain and SOLVER_TARGET_INTENT_ID not provided. Create an intent or set the env var.",
    );
  }

  const onchainIntent = await intentHub.getIntent(targetIntentId);
  if (onchainIntent.trader === zeroAddress) {
    throw new Error(`Intent ${targetIntentId} not found`);
  }

  const now = Math.floor(Date.now() / 1000);
  const commitDeadline = Number(onchainIntent.commitDeadline);
  if (commitDeadline <= now) {
    throw new Error(`Intent ${targetIntentId} commit window already closed`);
  }
  if (Number(onchainIntent.state) !== 1) {
    throw new Error(`Intent ${targetIntentId} is not open (state ${onchainIntent.state})`);
  }

  const parsedMetadata = decodeIntentMetadata(onchainIntent.extraData);
  const metadata: Record<string, unknown> = {
    ...parsedMetadata,
    commitDeadline,
    revealDeadline: Number(onchainIntent.revealDeadline),
    executionDeadline: Number(onchainIntent.executionDeadline),
  };

  const fromToken =
    env.SOLVER_FROM_TOKEN_OVERRIDE ??
    (parsedMetadata?.fromToken as string | undefined) ??
    onchainIntent.settlementAsset ??
    zeroAddress;
  const toToken =
    env.SOLVER_TO_TOKEN_OVERRIDE ??
    (parsedMetadata?.toToken as string | undefined) ??
    onchainIntent.settlementAsset ??
    zeroAddress;

  const sourceChainId =
    env.SOLVER_SOURCE_CHAIN_ID ?? (parsedMetadata?.sourceChainId as number | undefined) ?? DEFAULT_CHAIN_ID;
  const destinationChainId =
    env.SOLVER_DESTINATION_CHAIN_ID ?? (parsedMetadata?.destinationChainId as number | undefined);

  return {
    intentId: BigInt(targetIntentId),
    fromToken: fromToken,
    toToken: toToken,
    amountIn: BigInt(onchainIntent.amountIn),
    minAmountOut: BigInt(onchainIntent.minAmountOut),
    sourceChainId,
    destinationChainId,
    metadata,
  };
}

async function findOpenIntentId(): Promise<bigint | undefined> {
  const latestId: bigint = BigInt(await intentHub.nextIntentId());
  if (latestId === 0n) {
    return undefined;
  }

  const now = Math.floor(Date.now() / 1000);
  let scanned = 0n;
  for (let id = latestId; id >= 1n && scanned < MAX_INTENT_SCAN; id--, scanned++) {
    const intent = await intentHub.getIntent(id);
    if (intent.trader === zeroAddress) {
      continue;
    }
    if (Number(intent.state) !== 1) {
      continue;
    }
    if (Number(intent.commitDeadline) <= now) {
      continue;
    }
    return id;
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
    console.warn("[solver] unable to decode intent metadata", error);
  }

  return undefined;
}
