export interface DashboardNetworkConfig {
  name: string;
  blocklockSender: `0x${string}`;
  settlementAssets: {
    symbol: string;
    address: `0x${string}`;
    decimals: number;
  }[];
  defaultCommitWindowSeconds?: number;
  defaultRevealDelayBlocks?: number;
  defaultExecutionWindowSeconds?: number;
  intentHubAddress?: `0x${string}`;
  settlementEscrowAddress?: `0x${string}`;
}

export interface DashboardConfig {
  intentHubAddress: `0x${string}`;
  settlementEscrowAddress: `0x${string}`;
  networks: DashboardNetworkConfig[];
}

