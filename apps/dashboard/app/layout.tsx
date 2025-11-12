import "./globals.css";
import type { Metadata } from "next";
import { ReactQueryClientProvider } from "../components/ReactQueryProvider";
import { WagmiProvider } from "../components/WagmiProvider";

export const metadata: Metadata = {
  title: "CipherFlow Dashboard",
  description: "Monitor intents, solver decisions, and BlockLock commitments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider>
          <ReactQueryClientProvider>{children}</ReactQueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}

