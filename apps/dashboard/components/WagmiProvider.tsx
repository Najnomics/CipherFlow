"use client";

import { WagmiConfig, createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ReactNode } from "react";
import { injected } from "wagmi/connectors";

const rpcUrl =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
  "https://base-sepolia.g.alchemy.com/v2/demo";

const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
  },
  multiInjectedProviderDiscovery: true,
  autoConnect: true,
  ssr: true,
});

export function WagmiProvider({ children }: { children: ReactNode }) {
  return <WagmiConfig config={wagmiConfig}>{children}</WagmiConfig>;
}

