import { getAddress } from "viem";
import intentRegistry from "../../../libs/intent-registry.json";
import intentHubArtifact from "../../../out/IntentHub.sol/IntentHub.json";
import settlementEscrowArtifact from "../../../out/SettlementEscrow.sol/SettlementEscrow.json";
import type { DashboardConfig, DashboardNetworkConfig } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const ZERO_ADDRESS_REGEX = /^0x0{40}$/i;

function normalizeAddress(
  value: unknown,
  { allowZero = false }: { allowZero?: boolean } = {},
): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("0x")) return null;
  if (ZERO_ADDRESS_REGEX.test(trimmed)) {
    return allowZero ? (ZERO_ADDRESS as `0x${string}`) : null;
  }
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

const networks = (intentRegistry.networks as DashboardNetworkConfig[]).map((network) => ({
  ...network,
  intentHubAddress: normalizeAddress(network.intentHubAddress) ?? network.intentHubAddress,
  settlementEscrowAddress:
    normalizeAddress(network.settlementEscrowAddress) ?? network.settlementEscrowAddress,
  settlementAssets: network.settlementAssets.map((asset) => ({
    ...asset,
    address: normalizeAddress(asset.address, { allowZero: true }) ?? (asset.address as `0x${string}`),
  })),
}));

const registryIntentHub =
  networks.find((network) => normalizeAddress(network.intentHubAddress))?.intentHubAddress ?? null;

const registrySettlementEscrow =
  networks.find((network) => normalizeAddress(network.settlementEscrowAddress))
    ?.settlementEscrowAddress ?? null;

const intentHubAddress =
  normalizeAddress(process.env.NEXT_PUBLIC_INTENT_HUB_ADDRESS) ??
  normalizeAddress(process.env.NEXT_PUBLIC_INTENT_HUB_ADDR) ??
  normalizeAddress(process.env.INTENT_HUB_ADDRESS) ??
  normalizeAddress(process.env.INTENT_HUB_ADDR) ??
  registryIntentHub ??
  (ZERO_ADDRESS as `0x${string}`);

const settlementEscrowAddress =
  normalizeAddress(process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS) ??
  normalizeAddress(process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDR) ??
  normalizeAddress(process.env.SETTLEMENT_ESCROW_ADDRESS) ??
  normalizeAddress(process.env.SETTLEMENT_ESCROW_ADDR) ??
  registrySettlementEscrow ??
  (ZERO_ADDRESS as `0x${string}`);

export const dashboardConfig: DashboardConfig = {
  intentHubAddress,
  settlementEscrowAddress,
  networks,
};

export const intentHubAbi = intentHubArtifact.abi;
export const settlementEscrowAbi = settlementEscrowArtifact.abi;

