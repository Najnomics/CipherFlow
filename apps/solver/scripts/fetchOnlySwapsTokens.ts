#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";

const REQUIRED_ENV = ["RPC_URL", "ONLYSWAPS_ROUTER"] as const;

function requireEnv<T extends string>(key: T): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseBlockEnv(key: string, fallback?: bigint): bigint | undefined {
  const raw = process.env[key];
  if (!raw || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  try {
    if (normalized.startsWith("0x")) {
      return BigInt(normalized);
    }
    return BigInt(normalized);
  } catch (error) {
    throw new Error(`Invalid block number provided for ${key}: ${raw}`);
  }
}

type TokenMeta = {
  address: Address;
  symbol: string | null;
  decimals: number | null;
};

type DestinationMapping = {
  dstChainId: number;
  dstToken: Address;
  firstSeenBlock: bigint;
  transactionHash: Hex;
};

type GroupedMapping = {
  srcToken: TokenMeta;
  destinations: DestinationMapping[];
};

async function fetchErc20Meta(
  client: ReturnType<typeof createPublicClient>,
  address: Address,
): Promise<TokenMeta> {
  const erc20Fragment = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ] as const;

  let symbol: string | null = null;
  let decimals: number | null = null;

  try {
    symbol = (await client.readContract({
      address,
      abi: erc20Fragment,
      functionName: "symbol",
    })) as string;
  } catch (error) {
    console.warn(`[fetchTokens] Failed to read symbol for ${address}: ${(error as Error).message}`);
  }

  try {
    const value = (await client.readContract({
      address,
      abi: erc20Fragment,
      functionName: "decimals",
    })) as bigint | number;
    decimals = Number(value);
  } catch (error) {
    console.warn(`[fetchTokens] Failed to read decimals for ${address}: ${(error as Error).message}`);
  }

  return {
    address,
    symbol,
    decimals,
  };
}

async function main() {
  REQUIRED_ENV.forEach((key) => requireEnv(key));

  const rpcUrl = requireEnv("RPC_URL");
  const routerAddress = requireEnv("ONLYSWAPS_ROUTER") as Address;
  const outputFile = process.env.OUTPUT_FILE;

  const fromBlock = parseBlockEnv("FROM_BLOCK", 0n);
  const toBlock = parseBlockEnv("TO_BLOCK");

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const chainId = await client.getChainId();

  const event = parseAbiItem("event TokenMappingAdded(uint256 dstChainId, address dstToken, address srcToken)");

  const logs = await client.getLogs({
    address: routerAddress,
    event,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) {
    console.log("[fetchTokens] No TokenMappingAdded logs found for supplied parameters.");
    process.exit(0);
  }

  const destinationMap = new Map<string, DestinationMapping>();
  const grouped = new Map<Address, DestinationMapping[]>();

  for (const log of logs) {
    const { dstChainId, dstToken, srcToken } = log.args;

    if (!dstChainId || !dstToken || !srcToken) {
      console.warn("[fetchTokens] Encountered log with missing arguments, skipping.", log);
      continue;
    }

    const key = `${srcToken.toLowerCase()}::${dstChainId.toString()}`;
    const existing = destinationMap.get(key);
    if (existing && existing.dstToken.toLowerCase() !== dstToken.toLowerCase()) {
      throw new Error(
        `One-to-many token mapping detected for srcToken ${srcToken} and dstChainId ${dstChainId}. ` +
          `Existing destination ${existing.dstToken}, new destination ${dstToken}.`,
      );
    }

    const mapping: DestinationMapping = {
      dstChainId: Number(dstChainId),
      dstToken: dstToken as Address,
      firstSeenBlock: log.blockNumber,
      transactionHash: log.transactionHash,
    };

    destinationMap.set(key, mapping);

    const list = grouped.get(srcToken as Address) ?? [];
    if (!list.some((entry) => entry.dstChainId === mapping.dstChainId)) {
      list.push(mapping);
    }
    grouped.set(srcToken as Address, list);
  }

  const tokenMetaCache = new Map<Address, TokenMeta>();
  async function getTokenMeta(address: Address): Promise<TokenMeta> {
    const cached = tokenMetaCache.get(address);
    if (cached) return cached;
    const meta = await fetchErc20Meta(client, address);
    tokenMetaCache.set(address, meta);
    return meta;
  }

  const groupedOutput: GroupedMapping[] = [];
  for (const [srcToken, destinations] of grouped.entries()) {
    const meta = await getTokenMeta(srcToken);
    groupedOutput.push({
      srcToken: meta,
      destinations: destinations.sort((a, b) => a.dstChainId - b.dstChainId),
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    chainId,
    router: routerAddress,
    fromBlock: fromBlock?.toString() ?? null,
    toBlock: toBlock?.toString() ?? null,
    mappings: groupedOutput.sort((a, b) =>
      a.srcToken.address.toLowerCase().localeCompare(b.srcToken.address.toLowerCase()),
    ),
  };

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(__dirname, "../../..");
  const resolvedOutput = resolve(
    projectRoot,
    outputFile ?? `libs/testing/harness/onlyswaps-${chainId}.json`,
  );

  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, JSON.stringify(payload, null, 2));

  console.log(`[fetchTokens] Wrote ${groupedOutput.length} token mappings to ${resolvedOutput}`);
}

main().catch((error) => {
  console.error("[fetchTokens] Failed to fetch token mappings:", error);
  process.exit(1);
});


