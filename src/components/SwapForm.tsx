import { useState, useEffect } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import { ArrowDown, Loader2 } from "lucide-react";
import { executeSwap, getTokenInfo, getQuote, type QuoteData, type SwapResult } from "../lib/solana-swap";

interface SwapFormProps {
  walletProvider?: Provider;
  balance: string;
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

  // Fetch token info and quote when tokens or amount change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amount || !fromTokenAddress || !toTokenAddress || parseFloat(amount) <= 0) {
        setQuote(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const tokenInfo = await getTokenInfo(fromTokenAddress, toTokenAddress);
        const amountInUnits = (parseFloat(amount) * Math.pow(10, tokenInfo.fromToken.decimals)).toString();
        const quoteData = await getQuote(fromTokenAddress, toTokenAddress, amountInUnits);
        setQuote(quoteData);
      } catch (err) {
        setError("Failed to fetch quote");
        console.error("Quote fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [fromTokenAddress, toTokenAddress, amount]);

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

    setLoading(true);
    setError(null);
    setSwapResult(null);

    try {
      const tokenInfo = await getTokenInfo(fromTokenAddress, toTokenAddress);
      const amountInUnits = (parseFloat(amount) * Math.pow(10, tokenInfo.fromToken.decimals)).toString();
      const result: SwapResult = await executeSwap(fromTokenAddress, toTokenAddress, amountInUnits, walletProvider, slippage);
      setSwapResult(result);
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
              Estimated Output: {(parseFloat(quote.toAmount) / Math.pow(10, quote.toToken.decimals)).toFixed(4)} {quote.toToken.symbol}
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