import { useState, useEffect } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import { ArrowDown, Loader2 } from "lucide-react";
import axios from "axios";
import { Connection, Transaction, VersionedTransaction, ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import base58 from "bs58";

// Backend API URL (adjust based on your backend deployment)
const BACKEND_API_URL = "http://localhost:3001"; // Update this if your backend is hosted elsewhere

// Solana Connection
const connection = new Connection("https://api.mainnet-beta.solana.com", {
  confirmTransactionInitialTimeout: 30000,
});

interface SwapFormProps {
  walletProvider?: Provider;
  balance: string;
}

interface QuoteData {
  toTokenAmount: string;
  fromToken: {
    tokenSymbol: string;
    decimal: string;
    tokenUnitPrice: string | null;
  };
  toToken: {
    tokenSymbol: string;
    decimal: string;
    tokenUnitPrice: string | null;
  };
}

interface SwapResult {
  success: boolean;
  orderId?: string;
  txHash?: string;
  status?: string;
  error?: string;
}

export default function SwapForm({ walletProvider, balance }: SwapFormProps) {
  const { isConnected } = useAppKitAccount();
  const [fromTokenAddress, setFromTokenAddress] = useState<string>("So11111111111111111111111111111111111111112"); // SOL
  const [toTokenAddress, setToTokenAddress] = useState<string>("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
  const [amount, setAmount] = useState<string>("");
  const [slippage] = useState<string>("0.5"); // Fixed slippage for simplicity
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch quote when tokens or amount change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amount || !fromTokenAddress || !toTokenAddress || parseFloat(amount) <= 0) {
        setQuote(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const decimals = fromTokenAddress === "So11111111111111111111111111111111111111112" ? 9 : 6; // SOL: 9 decimals, USDC: 6 decimals
        const amountInUnits = (parseFloat(amount) * Math.pow(10, decimals)).toString();
        
        const response = await axios.post(`${BACKEND_API_URL}/api/swap/quote`, {
          fromTokenAddress,
          toTokenAddress,
          amount: amountInUnits,
        });

        if (!response.data.success || !response.data.data) {
          throw new Error(response.data.error || "Failed to fetch quote");
        }

        setQuote(response.data.data);
      } catch (err) {
        setError("Failed to fetch quote");
        console.error("Quote fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [fromTokenAddress, toTokenAddress, amount]);

  // Get priority fee for Solana transaction
  const getPriorityFee = async (): Promise<number> => {
    try {
      const recentFees = await connection.getRecentPrioritizationFees();
      const maxFee = Math.max(...recentFees.map(fee => fee.prioritizationFee), 10000);
      return Math.min(maxFee * 2, 100000);
    } catch (error) {
      console.error("Error getting priority fee, using default:", error);
      return 10000;
    }
  };

  // Prepare transaction for signing
  const prepareTransaction = async (callData: string, userAddress: string): Promise<Transaction | VersionedTransaction> => {
    try {
      const decodedTransaction = base58.decode(callData);
      const recentBlockhash = await connection.getLatestBlockhash('confirmed');
      const userPublicKey = new PublicKey(userAddress);

      let tx: Transaction | VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(decodedTransaction);
        tx.message.recentBlockhash = recentBlockhash.blockhash;
      } catch {
        tx = Transaction.from(decodedTransaction);
        tx.recentBlockhash = recentBlockhash.blockhash;
      }

      if (tx instanceof Transaction) {
        tx.feePayer = userPublicKey;

        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 300000,
        });
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: await getPriorityFee(),
        });

        tx.add(computeBudgetIx, priorityFeeIx);
      } else {
        console.log("VersionedTransaction detected; ensuring fee payer is user.");
      }

      return tx;
    } catch (error) {
      console.error("Error preparing transaction:", error);
      throw new Error("Failed to prepare transaction for signing");
    }
  };

  // Handle swap execution
  const handleSwap = async () => {
    if (!isConnected || !walletProvider || !amount || !fromTokenAddress || !toTokenAddress) {
      setError("Please connect wallet and fill in all fields");
      return;
    }

    if (parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    if (!walletProvider.publicKey) {
      setError("Wallet public key is not available");
      return;
    }

    setLoading(true);
    setError(null);
    setSwapResult(null);

    try {
      const userAddress = walletProvider.publicKey.toString();
      const decimals = fromTokenAddress === "So11111111111111111111111111111111111111112" ? 9 : 6; // SOL: 9 decimals, USDC: 6 decimals
      const amountInUnits = (parseFloat(amount) * Math.pow(10, decimals)).toString();

      // Step 1: Get swap data from backend
      const swapResponse = await axios.post(`${BACKEND_API_URL}/api/swap/execute`, {
        fromTokenAddress,
        toTokenAddress,
        amount: amountInUnits,
        userAddress,
        slippage,
        signedTx: "pending", // Placeholder, will be replaced after signing
      });

      if (!swapResponse.data.success || !swapResponse.data.data) {
        throw new Error(swapResponse.data.error || "Failed to fetch swap data");
      }

      const swapData = swapResponse.data.data;
      const callData = swapData.tx.data;

      if (!callData) {
        throw new Error("Invalid transaction data received from API");
      }

      // Step 2: Prepare and sign the transaction
      const transaction = await prepareTransaction(callData, userAddress);
      await walletProvider.sendTransaction(transaction, connection);
      const signedTx = base58.encode(transaction.serialize());

      // Step 3: Execute the swap with the signed transaction
      const executeResponse = await axios.post(`${BACKEND_API_URL}/api/swap/execute`, {
        fromTokenAddress,
        toTokenAddress,
        amount: amountInUnits,
        userAddress,
        slippage,
        signedTx,
      });

      if (!executeResponse.data.success) {
        throw new Error(executeResponse.data.error || "Swap execution failed");
      }

      const { orderId, txHash, status } = executeResponse.data.data;
      setSwapResult({
        success: true,
        orderId,
        txHash,
        status,
      });
    } catch (err) {
      setError("Swap failed. You may need to sign the transaction with your wallet.");
      console.error("Swap error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Ensure toTokenAddress updates if fromTokenAddress changes to the same value
  useEffect(() => {
    if (fromTokenAddress === toTokenAddress) {
      setToTokenAddress(fromTokenAddress === "So11111111111111111111111111111111111111112" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "So11111111111111111111111111111111111111112");
    }
  }, [fromTokenAddress]);

  useEffect(() => {
    if (toTokenAddress === fromTokenAddress) {
      setFromTokenAddress(toTokenAddress === "So11111111111111111111111111111111111111112" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "So11111111111111111111111111111111111111112");
    }
  }, [toTokenAddress]);

  return (
    <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl w-full max-w-md mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-4">Swap Tokens</h2>

      {/* Swap Form */}
      <div className="space-y-4">
        {/* From Token */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">From</label>
          <select
            value={fromTokenAddress}
            onChange={(e) => setFromTokenAddress(e.target.value)}
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="So11111111111111111111111111111111111111112">SOL</option>
            <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="mt-2 w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <p className="text-sm text-gray-400 mt-1">Balance: {balance} SOL</p>
        </div>

        {/* Swap Arrow */}
        <div className="flex justify-center">
          <ArrowDown className="w-6 h-6 text-gray-400" />
        </div>

        {/* To Token */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">To</label>
          <select
            value={toTokenAddress}
            onChange={(e) => setToTokenAddress(e.target.value)}
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
            <option value="So11111111111111111111111111111111111111112">SOL</option>
          </select>
          {quote && (
            <p className="mt-2 text-sm text-gray-300">
              Estimated Output: {(parseFloat(quote.toTokenAmount) / Math.pow(10, parseInt(quote.toToken.decimal))).toFixed(4)} {quote.toToken.tokenSymbol}
            </p>
          )}
        </div>

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={loading || !isConnected || !amount || parseFloat(amount) <= 0}
          className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 ${
            loading || !isConnected || !amount || parseFloat(amount) <= 0
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700'
          } text-white flex items-center justify-center gap-2`}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Swapping...
            </>
          ) : (
            'Swap'
          )}
        </button>

        {/* Swap Result */}
        {swapResult && (
          <div className="p-4 bg-gray-700 rounded-lg mt-4">
            {swapResult.success ? (
              <>
                <p className="text-sm text-green-400">Swap Successful!</p>
                <p className="text-sm">Transaction Hash: {swapResult.txHash}</p>
                <p className="text-sm">Status: {swapResult.status}</p>
              </>
            ) : (
              <p className="text-sm text-red-400">Swap Failed: {swapResult.error}</p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-600 rounded-lg mt-4">
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}