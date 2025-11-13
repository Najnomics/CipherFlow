import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
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
    <html lang="en" className="bg-slate-950 text-slate-100">
      <head>
        <Script
          id="tailwind-config"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.tailwind = window.tailwind || {};
              window.tailwind.config = {
                theme: {
                  extend: {
                    colors: { primary: "#1d4ed8" }
                  }
                },
                darkMode: "media"
              };
            `,
          }}
        />
        <Script
          src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio"
          strategy="beforeInteractive"
        />
        <style>
          {`
            *, *::before, *::after { box-sizing: border-box; }
            body {
              margin: 0;
              background-color: #020617;
              color: #e2e8f0;
              font-family: var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
            }
            a {
              color: #1d4ed8;
            }
            button {
              font-family: inherit;
            }
          `}
        </style>
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <WagmiProvider>
          <ReactQueryClientProvider>{children}</ReactQueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}

