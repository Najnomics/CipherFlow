"use client";

import { WagmiConfig, createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ReactNode } from "react";

const rpcUrl =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
  "https://base-sepolia.g.alchemy.com/v2/demo";

const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
  },
  ssr: true,
});

export function WagmiProvider({ children }: { children: ReactNode }) {
  return <WagmiConfig config={wagmiConfig}>{children}</WagmiConfig>;
}

