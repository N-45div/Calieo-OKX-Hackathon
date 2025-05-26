import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface WalletConnectProps {
    onConnect: () => void;
}

export default function WalletConnect({ onConnect }: WalletConnectProps) {
    const { wallet, connect, disconnect, publicKey, connecting, connected } = useWallet();
    const { setVisible } = useWalletModal();

    const handleConnect = async () => {
        try {
            if (!wallet) {
                // Add a slight delay to ensure UI stability
                await new Promise(resolve => setTimeout(resolve, 100));
                setVisible(true);
            } else if (!connected) {
                await connect();
                onConnect();
            }
        } catch (error) {
            console.error("Wallet connection error:", error);
            alert("Failed to connect wallet. Please try again.");
        }
    };

    const handleDisconnect = async () => {
        try {
            await disconnect();
            onConnect();
        } catch (error) {
            console.error("Wallet disconnection error:", error);
            alert("Failed to disconnect wallet. Please try again.");
        }
    };

    return (
        <div className="p-4">
            {connected && publicKey ? (
                <div className="flex flex-col items-center space-y-4">
                    <div className="text-center">
                        <p className="text-green-400 font-semibold">
                            ✓ Wallet Connected
                        </p>
                        <p className="text-gray-300 text-sm font-mono">
                            {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                            {wallet?.adapter.name}
                        </p>
                    </div>
                    <button
                        onClick={handleDisconnect}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors duration-200 text-white font-medium"
                    >
                        Disconnect Wallet
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className={`w-full px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                        connecting
                            ? "bg-gray-600 cursor-not-allowed text-gray-300"
                            : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg"
                    }`}
                >
                    {connecting ? (
                        <div className="flex items-center justify-center space-x-2">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                            <span>Connecting...</span>
                        </div>
                    ) : (
                        "Connect Wallet"
                    )}
                </button>
            )}
        </div>
    );
}