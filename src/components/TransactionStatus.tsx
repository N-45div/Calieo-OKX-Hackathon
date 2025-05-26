import type { SwapResult } from "../lib/solana-swap";

interface TransactionStatusProps {
    txResult: SwapResult | null;
}

export default function TransactionStatus({ txResult }: TransactionStatusProps) {
    if (!txResult) return null;

    return (
        <div className="p-4 mt-4 bg-gray-800 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-2">Transaction Status</h2>
            {txResult.success ? (
                <div>
                    <p className="text-green-400">Swap Successful!</p>
                    <p>Order ID: {txResult.orderId}</p>
                    {txResult.txHash && (
                        <p>
                            Tx Hash:{" "}
                            <a
                                href={`https://solscan.io/tx/${txResult.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 underline"
                            >
                                {txResult.txHash.slice(0, 8)}...
                            </a>
                        </p>
                    )}
                </div>
            ) : (
                <div>
                    <p className="text-red-400">Swap Failed</p>
                    <p>Error: {txResult.error}</p>
                </div>
            )}
        </div>
    );
}