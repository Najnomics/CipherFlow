import intentRegistry from "../../../libs/intent-registry.json";
import intentHubArtifact from "../../../out/IntentHub.sol/IntentHub.json";
import settlementEscrowArtifact from "../../../out/SettlementEscrow.sol/SettlementEscrow.json";
import type { DashboardConfig } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const intentHubEnv =
  process.env.NEXT_PUBLIC_INTENT_HUB_ADDR ??
  process.env.INTENT_HUB_ADDR ??
  ZERO_ADDRESS;

const settlementEscrowEnv =
  process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDR ??
  process.env.SETTLEMENT_ESCROW_ADDR ??
  ZERO_ADDRESS;

export const dashboardConfig: DashboardConfig = {
  intentHubAddress: intentHubEnv as `0x${string}`,
  settlementEscrowAddress: settlementEscrowEnv as `0x${string}`,
  networks: intentRegistry.networks as DashboardConfig["networks"],
};

export const intentHubAbi = intentHubArtifact.abi;
export const settlementEscrowAbi = settlementEscrowArtifact.abi;

