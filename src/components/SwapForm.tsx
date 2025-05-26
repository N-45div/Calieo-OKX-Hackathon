import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { convertAmount, executeSwap, getTokenInfo, getQuote, type SwapResult } from "../lib/solana-swap";
import { analyzeSentiment } from "../lib/sentiment-analysis";
import { ArrowUpDown, Settings, Zap, TrendingUp, AlertCircle, CheckCircle2, Loader2, ChevronDown, X } from "lucide-react";

interface TokenInfo {
    symbol: string;
    decimals: number;
    price: string;
}

interface SwapFormProps {
    onSwap: (fromToken: string, toToken: string, amount: string, slippage: string) => Promise<SwapResult>;
}

const popularTokens = [
    { address: "11111111111111111111111111111111", symbol: "SOL", name: "Solana" },
    { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin" },
    { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", name: "Tether" },
];

export default function SwapForm({ onSwap }: SwapFormProps) {
    const wallet = useWallet();
    const [fromTokenAddress, setFromTokenAddress] = useState<string>("11111111111111111111111111111111");
    const [toTokenAddress, setToTokenAddress] = useState<string>("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const [amount, setAmount] = useState<string>("0.1");
    const [slippage, setSlippage] = useState<string>("0.5");
    const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
    const [feedback, setFeedback] = useState<string>("");
    const [sentiment, setSentiment] = useState<{ sentiment: string; confidence: number } | null>(null);
    const [fromTokenInfo, setFromTokenInfo] = useState<TokenInfo | null>(null);
    const [toTokenInfo, setToTokenInfo] = useState<TokenInfo | null>(null);
    const [toAmount, setToAmount] = useState<string>("0.0");
    const [fromBalance, setFromBalance] = useState<string>("0.00");
    const [toBalance, setToBalance] = useState<string>("0.00");
    const [loading, setLoading] = useState<boolean>(false);
    const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [showTokenSelector, setShowTokenSelector] = useState<{ type: 'from' | 'to' | null }>({ type: null });
    const [tokenInfoError, setTokenInfoError] = useState<string | null>(null);
    const [lastFetchedAmount, setLastFetchedAmount] = useState<string | null>(null);

    const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=2d8978c6-7067-459f-ae97-7ea035f1a0cb", "confirmed");

    // Fetch wallet balances
    const fetchBalances = useCallback(async () => {
        if (!wallet.publicKey) {
            setFromBalance("0.00");
            setToBalance("0.00");
            return;
        }

        try {
            // Fetch SOL balance
            if (fromTokenAddress === "11111111111111111111111111111111") {
                const solBalance = await connection.getBalance(wallet.publicKey);
                setFromBalance((solBalance / 1e9).toFixed(2)); // Convert lamports to SOL
            } else {
                // Fetch token balance for SPL tokens
                const tokenMint = new PublicKey(fromTokenAddress);
                const accounts = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: tokenMint });
                const tokenAccount = accounts.value[0];
                if (tokenAccount) {
                    const balance = await connection.getTokenAccountBalance(tokenAccount.pubkey);
                    setFromBalance((balance.value.uiAmount || 0).toFixed(2));
                } else {
                    setFromBalance("0.00");
                }
            }

            if (toTokenAddress === "11111111111111111111111111111111") {
                const solBalance = await connection.getBalance(wallet.publicKey);
                setToBalance((solBalance / 1e9).toFixed(2));
            } else {
                const tokenMint = new PublicKey(toTokenAddress);
                const accounts = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: tokenMint });
                const tokenAccount = accounts.value[0];
                if (tokenAccount) {
                    const balance = await connection.getTokenAccountBalance(tokenAccount.pubkey);
                    setToBalance((balance.value.uiAmount || 0).toFixed(2));
                } else {
                    setToBalance("0.00");
                }
            }
        } catch (error) {
            console.error("Error fetching balances:", error);
            setFromBalance("0.00");
            setToBalance("0.00");
        }
    }, [wallet.publicKey, fromTokenAddress, toTokenAddress]);

    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    // Debounce utility
    const debounce = (func: (...args: any[]) => void, wait: number) => {
        let timeout: NodeJS.Timeout;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    };

    // Fetch token info when addresses change
    const fetchTokenInfo = useCallback(async () => {
        if (!fromTokenAddress || !toTokenAddress) return;

        setTokenInfoError(null);
        try {
            const info = await getTokenInfo(fromTokenAddress, toTokenAddress);
            setFromTokenInfo(info.fromToken);
            setToTokenInfo(info.toToken);
        } catch (error) {
            console.error("Error fetching token info:", error);
            setTokenInfoError("Failed to fetch token information. Please try again later.");
        }
    }, [fromTokenAddress, toTokenAddress]);

    // Fetch quote when amount or token addresses change
    const fetchQuote = useCallback(async () => {
        if (
            !fromTokenAddress ||
            !toTokenAddress ||
            !amount ||
            parseFloat(amount) <= 0 ||
            !fromTokenInfo ||
            amount === lastFetchedAmount
        ) return;

        setQuoteLoading(true);
        try {
            const convertedAmount = convertAmount(amount, fromTokenInfo.decimals);
            const quote = await getQuote(fromTokenAddress, toTokenAddress, convertedAmount);
            const toDecimals = quote.toToken.decimals;
            const toAmountFormatted = (parseFloat(quote.toAmount) / Math.pow(10, toDecimals)).toFixed(6);
            setToAmount(toAmountFormatted);
            setLastFetchedAmount(amount);
        } catch (error) {
            console.error("Error fetching quote:", error);
            setToAmount("0.0");
            setLastFetchedAmount(null);
        } finally {
            setQuoteLoading(false);
        }
    }, [fromTokenAddress, toTokenAddress, amount, fromTokenInfo, lastFetchedAmount]);

    const debouncedFetchTokenInfo = useCallback(debounce(fetchTokenInfo, 500), [fetchTokenInfo]);
    const debouncedFetchQuote = useCallback(debounce(fetchQuote, 500), [fetchQuote]);

    useEffect(() => {
        debouncedFetchTokenInfo();
    }, [debouncedFetchTokenInfo]);

    useEffect(() => {
        debouncedFetchQuote();
    }, [debouncedFetchQuote]);

    const handleTokenSwap = () => {
        setFromTokenAddress(toTokenAddress);
        setToTokenAddress(fromTokenAddress);
        setFromTokenInfo(toTokenInfo);
        setToTokenInfo(fromTokenInfo);
        setToAmount("0.0"); // Reset toAmount on token swap
        setLastFetchedAmount(null); // Reset last fetched amount to ensure quote refresh
    };

    const handleTokenSelect = (address: string, type: 'from' | 'to') => {
        const token = popularTokens.find(t => t.address === address);
        if (token) {
            if (type === 'from') {
                setFromTokenAddress(address);
            } else {
                setToTokenAddress(address);
            }
        }
        setShowTokenSelector({ type: null });
    };

    const handleSwap = async () => {
        if (!wallet.connected || !wallet.publicKey) {
            alert("Please connect your wallet first!");
            return;
        }

        setLoading(true);
        try {
            const decimals = fromTokenInfo?.decimals || 9; // Default to 9 for SOL if not fetched
            const convertedAmount = convertAmount(amount, decimals);
            const result = await executeSwap(
                fromTokenAddress,
                toTokenAddress,
                convertedAmount,
                wallet,
                slippage
            );
            setSwapResult(result);

            // Analyze sentiment if feedback is provided
            if (feedback) {
                const sentimentResult = await analyzeSentiment(feedback);
                setSentiment(sentimentResult);
            }

            await onSwap(fromTokenAddress, toTokenAddress, amount, slippage);
        } catch (error) {
            console.error("Swap error:", error);
            setSwapResult({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative w-full max-w-md mx-auto px-4 sm:px-0">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-2xl sm:rounded-3xl blur-xl"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 via-blue-600/10 to-cyan-600/10 rounded-2xl sm:rounded-3xl"></div>
            
            {/* Main Container */}
            <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 sm:mb-8">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-purple-500 to-blue-500">
                            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                            Token Swap
                        </h2>
                    </div>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-300 active:scale-95 sm:hover:scale-105"
                    >
                        <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" />
                    </button>
                </div>

                {/* Settings Panel */}
                {showSettings && (
                    <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/10 animate-in slide-in-from-top-2 duration-300">
                        <div className="space-y-3 sm:space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Slippage Tolerance</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['0.1', '0.5', '1.0'].map((preset) => (
                                        <button
                                            key={preset}
                                            onClick={() => setSlippage(preset)}
                                            className={`px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
                                                slippage === preset
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                                            }`}
                                        >
                                            {preset}%
                                        </button>
                                    ))}
                                    <input
                                        type="number"
                                        value={slippage}
                                        onChange={(e) => setSlippage(e.target.value)}
                                        className="px-2 sm:px-3 py-2 bg-white/10 text-white rounded-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                        placeholder="Custom"
                                        step="0.1"
                                        min="0.1"
                                        max="50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Token Info Error */}
                {tokenInfoError && (
                    <div className="mb-4 p-3 bg-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{tokenInfoError}</span>
                    </div>
                )}

                {/* From Token */}
                <div className="mb-2">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <label className="text-sm font-medium text-gray-400">You pay</label>
                        <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-500">
                            <TrendingUp className="w-3 h-3" />
                            <span className="hidden sm:inline">Balance:</span>
                            <span>{fromBalance}</span>
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-xl sm:rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 hover:border-white/20 transition-all duration-300">
                            <div className="flex items-center justify-between gap-2">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="flex-1 bg-transparent text-xl sm:text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none min-w-0"
                                    placeholder="0.0"
                                    step="any"
                                />
                                <button
                                    onClick={() => setShowTokenSelector({ type: 'from' })}
                                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg sm:rounded-xl transition-all duration-200 active:scale-95 sm:hover:scale-105 flex-shrink-0"
                                >
                                    {fromTokenInfo ? (
                                        <>
                                            <span className="font-semibold text-white text-sm sm:text-base">{fromTokenInfo.symbol}</span>
                                            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-gray-400 text-sm">Select</span>
                                            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                        </>
                                    )}
                                </button>
                            </div>
                            {fromTokenInfo && (
                                <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400">
                                    {(() => {
                                        const amountNum = parseFloat(amount || '0');
                                        const priceNum = parseFloat(fromTokenInfo?.price || "0");
                                        if (isNaN(amountNum) || isNaN(priceNum)) {
                                            console.error("Invalid values for 'You pay' calculation:", { amount, price: fromTokenInfo?.price });
                                            return "≈ $0.00";
                                        }
                                        return `≈ $${(amountNum * priceNum).toFixed(2)}`;
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center my-3 sm:my-4">
                    <button
                        onClick={handleTokenSwap}
                        className="p-2 sm:p-3 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-xl sm:rounded-2xl border border-white/20 transition-all duration-300 active:scale-95 sm:hover:scale-110 sm:hover:rotate-180 group"
                    >
                        <ArrowUpDown className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 group-hover:text-purple-300" />
                    </button>
                </div>

                {/* To Token */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <label className="text-sm font-medium text-gray-400">You receive</label>
                        <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-500">
                            <TrendingUp className="w-3 h-3" />
                            <span className="hidden sm:inline">Balance:</span>
                            <span>{toBalance}</span>
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl sm:rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 hover:border-white/20 transition-all duration-300">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 text-xl sm:text-2xl font-semibold text-white min-w-0">
                                    {quoteLoading ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin flex-shrink-0" />
                                            <span className="text-gray-400 text-sm sm:text-base">Calculating...</span>
                                        </div>
                                    ) : (
                                        toAmount
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowTokenSelector({ type: 'to' })}
                                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg sm:rounded-xl transition-all duration-200 active:scale-95 sm:hover:scale-105 flex-shrink-0"
                                >
                                    {toTokenInfo ? (
                                        <>
                                            <span className="font-semibold text-white text-sm sm:text-base">{toTokenInfo.symbol}</span>
                                            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-gray-400 text-sm">Select</span>
                                            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                        </>
                                    )}
                                </button>
                            </div>
                            {toTokenInfo && toAmount !== "0.0" && (
                                <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400">
                                    {(() => {
                                        const amountNum = parseFloat(toAmount);
                                        const priceNum = parseFloat(toTokenInfo?.price || "0");
                                        if (isNaN(amountNum) || isNaN(priceNum)) {
                                            console.error("Invalid values for 'You receive' calculation:", { toAmount, price: toTokenInfo?.price });
                                            return "≈ $0.00";
                                        }
                                        return `≈ $${(amountNum * priceNum).toFixed(2)}`;
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Feedback */}
                <div className="mb-4 sm:mb-6">
                    <label className="block text-sm font-medium text-gray-400 mb-2 sm:mb-3">
                        Share your thoughts (optional)
                    </label>
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white/5 backdrop-blur-sm text-white rounded-xl sm:rounded-2xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 placeholder-gray-500 resize-none text-sm sm:text-base"
                        placeholder="How was your experience?"
                        rows={3}
                    />
                </div>

                {/* Swap Button */}
                <button
                    onClick={handleSwap}
                    disabled={loading || !wallet.connected}
                    className={`w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 text-base sm:text-lg relative overflow-hidden group ${
                        loading || !wallet.connected
                            ? "bg-gray-600/50 cursor-not-allowed"
                            : "bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 hover:from-purple-600 hover:via-blue-600 hover:to-cyan-600 shadow-lg hover:shadow-2xl hover:shadow-purple-500/25 active:scale-[0.98] sm:hover:scale-[1.02]"
                    }`}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                            <span>Processing...</span>
                        </>
                    ) : !wallet.connected ? (
                        <span>Connect Wallet</span>
                    ) : (
                        <>
                            <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span>Swap Tokens</span>
                        </>
                    )}
                </button>

                {/* Results */}
                {swapResult && (
                    <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/10 animate-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                            {swapResult.success ? (
                                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
                            ) : (
                                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 flex-shrink-0" />
                            )}
                            <h3 className="font-semibold text-white text-sm sm:text-base">
                                {swapResult.success ? "Swap Successful!" : "Swap Failed"}
                            </h3>
                        </div>
                        
                        {swapResult.success ? (
                            <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-gray-400 flex-shrink-0">Order ID:</span>
                                    <span className="text-white font-mono text-right break-all">{swapResult.orderId}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Status:</span>
                                    <span className="text-green-400">{swapResult.status}</span>
                                </div>
                                {swapResult.txHash && (
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="text-gray-400 flex-shrink-0">Transaction:</span>
                                        <span className="text-blue-400 font-mono text-right break-all">{swapResult.txHash}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-red-400 text-xs sm:text-sm">{swapResult.error}</p>
                        )}

                        {sentiment && (
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10">
                                <h4 className="text-xs sm:text-sm font-medium text-white mb-2">Sentiment Analysis</h4>
                                <div className="flex items-center gap-2">
                                    <div className={`px-2 py-1 rounded-lg text-xs font-medium ${
                                        sentiment.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' :
                                        sentiment.sentiment === 'negative' ? 'bg-red-500/20 text-red-400' :
                                        'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                        {sentiment.sentiment}
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {(sentiment.confidence * 100).toFixed(0)}% confidence
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Token Selector Modal */}
            {showTokenSelector.type && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-black/60 backdrop-blur-2xl border border-white/20 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 w-full max-w-sm max-h-[80vh] sm:max-h-[70vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-shrink-0">
                            <h3 className="text-lg sm:text-xl font-semibold text-white">Select Token</h3>
                            <button
                                onClick={() => setShowTokenSelector({ type: null })}
                                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors active:scale-95"
                            >
                                <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" />
                            </button>
                        </div>
                        <div className="space-y-2 overflow-y-auto flex-1">
                            {popularTokens.map((token) => (
                                <button
                                    key={token.address}
                                    onClick={() => handleTokenSelect(token.address, showTokenSelector.type!)}
                                    className="w-full p-3 sm:p-4 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl sm:rounded-2xl border border-white/10 transition-all duration-200 active:scale-[0.98] sm:hover:scale-[1.02] text-left"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-semibold text-white text-sm sm:text-base">{token.symbol}</div>
                                            <div className="text-xs sm:text-sm text-gray-400">{token.name}</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}