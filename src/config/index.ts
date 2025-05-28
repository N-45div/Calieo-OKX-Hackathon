import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';

// Get projectId from https://cloud.reown.com
export const projectId = import.meta.env.VITE_PROJECT_ID || "b56e18d47c72ab683b10814fe9495694"; // Public projectId for localhost

if (!projectId) {
  throw new Error('Project ID is not defined');
}

// Create a metadata object
export const metadata = {
  name: 'Calieo',
  description: 'Next-Gen DeFi Protocol',
  url: 'http://localhost:5173', // Must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/179229932'], // Use a valid icon URL
};

// Configure the Solana networks with a custom RPC endpoint
const customSolanaNetwork: AppKitNetwork = {
  ...solana,
  rpcUrls: {
    default: {
      http: ["https://mainnet.helius-rpc.com/?api-key=2d8978c6-7067-459f-ae97-7ea035f1a0cb"],
    },
  },
};

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [customSolanaNetwork, solanaTestnet, solanaDevnet];

// Set up Solana Adapter with a default RPC endpoint
export const solanaWeb3JsAdapter = new SolanaAdapter({
  rpc: {
    [solana.chainId]: "https://mainnet.helius-rpc.com/?api-key=2d8978c6-7067-459f-ae97-7ea035f1a0cb",
    [solanaTestnet.chainId]: solanaTestnet.rpcUrls.default.http[0],
    [solanaDevnet.chainId]: solanaDevnet.rpcUrls.default.http[0],
  },
});