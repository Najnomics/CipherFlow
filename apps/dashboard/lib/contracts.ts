import intentRegistry from "../../../libs/intent-registry.json";
import intentHubArtifact from "../../../out/IntentHub.sol/IntentHub.json";
import settlementEscrowArtifact from "../../../out/SettlementEscrow.sol/SettlementEscrow.json";
import type { DashboardConfig, DashboardNetworkConfig } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function normalizeAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("0x")) return null;
  if (trimmed.toLowerCase() === ZERO_ADDRESS.toLowerCase()) return null;
  return trimmed as `0x${string}`;
}

const networks = intentRegistry.networks as DashboardNetworkConfig[];

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

