import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { mainnet } from "@reown/appkit/networks";
import { AppKitProvider } from "@reown/appkit/react";
import { ReactNode, useEffect } from "react";

// Initialize AppKit with Solana adapter
const projectId = process.env.VITE_REOWN_PROJECT_ID || "your_project_id"; // Replace with your Reown project ID
if (!projectId) {
  throw new Error("Reown project ID is required. Set VITE_REOWN_PROJECT_ID in your .env file.");
}

const solanaAdapter = new SolanaAdapter({
  networks: [mainnet], // You can add other networks if needed
  walletConnectProjectId: projectId,
});

const appKit = createAppKit({
  adapters: [solanaAdapter],
  networks: [mainnet],
  projectId,
  metadata: {
    name: "Calieo",
    description: "Solana Trading Bot Telegram Mini App",
    url: "https://your-app-url.com", // Replace with your app URL
    icons: ["https://your-app-url.com/icon.png"], // Replace with your app icon URL
  },
  features: {
    analytics: true,
    email: false,
    socials: [],
    walletFeatures: true,
  },
});

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  useEffect(() => {
    appKit.open();
  }, []);

  return (
    <AppKitProvider appKit={appKit}>
      {children}
    </AppKitProvider>
  );
}