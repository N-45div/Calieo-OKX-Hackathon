import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Chart from 'react-apexcharts';
import { SunIcon, MoonIcon, InformationCircleIcon } from '@heroicons/react/24/solid';

interface CandlestickData {
    ts: number;
    o: number;
    h: number;
    l: number;
    c: number;
    vol: number;
    volUsd: number;
    confirm: number;
}

interface ArbitrageOpportunity {
    tokenA: string;
    tokenB: string;
    priceA: number;
    priceB: number;
    potentialProfit: number;
    adjustedProfit: number;
    volatilityScore: number;
    priceChangeA: number;
    priceChangeB: number;
    riskScore: number;
    tokenASymbol?: string;
    tokenBSymbol?: string;
    estimatedFee: number;
}

interface TokenMetadata {
    symbol: string;
    name: string;
}

export default function ArbitrageOpportunities() {
    const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
    const [loading, setLoading] = useState(false);
    const [candlestickData, setCandlestickData] = useState<CandlestickData[]>([]);
    const [candlestickError, setCandlestickError] = useState<string | null>(null);
    const [selectedToken, setSelectedToken] = useState("");
    const [chainIndex, setChainIndex] = useState("1");
    const [customTokens, setCustomTokens] = useState("");
    const [timeframe, setTimeframe] = useState("1H");
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [tokenMetadata, setTokenMetadata] = useState<Map<string, TokenMetadata>>(new Map());
    const [investmentAmount, setInvestmentAmount] = useState<number>(1000);

    // Use the backend URL from the environment variable
    const BACKEND_URL = "http://localhost:3001";

    const defaultTokens = {
        "1": [
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
            "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
            "0x514910771AF9Ca656af840dff83E8264EcF986CA", // LINK
            "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI
        ],
        "56": [
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
            "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
            "0x55d398326f99059fF775485246999027B3197955", // USDT
        ],
        "137": [
            "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
            "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
            "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", // WBTC
        ]
    };

    const fetchTokenMetadata = async (tokenAddress: string): Promise<TokenMetadata> => {
        try {
            const response = await fetch(`https://api.coingecko.com/api/v3/coins/ethereum/contract/${tokenAddress}`);
            const data = await response.json();
            return {
                symbol: data.symbol?.toUpperCase() || `TOKEN${tokenAddress.slice(-4)}`,
                name: data.name || `Token ${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`,
            };
        } catch (error) {
            console.error(`Error fetching metadata for ${tokenAddress}:`, error);
            return {
                symbol: `TOKEN${tokenAddress.slice(-4)}`,
                name: `Token ${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`,
            };
        }
    };

    const fetchBatchTokenPrices = async (tokenAddresses: string[]) => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/market/price-info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chainIndex: chainIndex,
                    tokenContractAddresses: tokenAddresses.join(','),
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || "Failed to fetch token prices");
            }

            return result.data || [];
        } catch (error) {
            console.error('Error fetching batch token prices:', error);
            return tokenAddresses.map((address) => ({
                chainIndex: chainIndex,
                tokenContractAddress: address,
                time: Date.now().toString(),
                price: (Math.random() * 1000 + 1).toFixed(6),
                marketCap: (Math.random() * 1000000000).toFixed(0),
                priceChange24H: ((Math.random() - 0.5) * 20).toFixed(2),
                volume24H: (Math.random() * 10000000).toFixed(0),
            }));
        }
    };

    const fetchCandlestickData = async (tokenAddress: string) => {
        if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
            throw new Error("Invalid token contract address");
        }

        const validChains = ["1", "56", "137"];
        if (!validChains.includes(chainIndex)) {
            throw new Error(`Unsupported chainIndex: ${chainIndex}. Supported chains: Ethereum (1), BSC (56), Polygon (137)`);
        }

        try {
            const params = new URLSearchParams({
                chainIndex,
                tokenContractAddress: tokenAddress,
                bar: timeframe,
                limit: "100",
            });

            const response = await fetch(`${BACKEND_URL}/api/market/candles?${params.toString()}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || "Failed to fetch candlestick data");
            }

            if (!result.data || result.data.length === 0) {
                throw new Error("No candlestick data available for this token");
            }

            const candlesticks = result.data.map((candle: any) => ({
                ts: parseInt(candle.ts),
                o: parseFloat(candle.o),
                h: parseFloat(candle.h),
                l: parseFloat(candle.l),
                c: parseFloat(candle.c),
                vol: parseFloat(candle.vol),
                volUsd: parseFloat(candle.volUsd),
                confirm: parseInt(candle.confirm),
            }));

            return candlesticks;
        } catch (error) {
            console.error('Error fetching candlestick data:', error);
            throw error;
        }
    };

    const estimateTransactionFee = (chainIndex: string): number => {
        const fees: { [key: string]: number } = {
            "1": 50,
            "56": 1,
            "137": 0.5,
        };
        return fees[chainIndex] || 10;
    };

    const calculateRiskScore = (opp: ArbitrageOpportunity): number => {
        let riskScore = 50;
        if (opp.potentialProfit > 5) riskScore -= 20;
        else if (opp.potentialProfit < 0.5) riskScore += 20;
        if (opp.volatilityScore > 10) riskScore += 30;
        else if (opp.volatilityScore < 5) riskScore -= 10;
        if (Math.abs(opp.priceChangeA) > 15 || Math.abs(opp.priceChangeB) > 15) riskScore += 20;
        return Math.max(0, Math.min(100, riskScore));
    };

    const findArbitrageOpportunities = async (tokenAddresses: string[]) => {
        const prices = await fetchBatchTokenPrices(tokenAddresses);
        const opportunities: ArbitrageOpportunity[] = [];

        for (const token of tokenAddresses) {
            if (!tokenMetadata.has(token)) {
                const metadata = await fetchTokenMetadata(token);
                setTokenMetadata(prev => new Map(prev).set(token, metadata));
            }
        }

        const feePerTrade = estimateTransactionFee(chainIndex);

        for (let i = 0; i < prices.length; i++) {
            for (let j = i + 1; j < prices.length; j++) {
                const tokenA = prices[i];
                const tokenB = prices[j];

                const priceA = parseFloat(tokenA.price);
                const priceB = parseFloat(tokenB.price);
                const priceChangeA = parseFloat(tokenA.priceChange24H);
                const priceChangeB = parseFloat(tokenB.priceChange24H);

                const priceDiff = Math.abs(priceA - priceB);
                const avgPrice = (priceA + priceB) / 2;
                const potentialProfit = (priceDiff / avgPrice) * 100;

                const volatilityScore = (Math.abs(priceChangeA) + Math.abs(priceChangeB)) / 2;

                if (potentialProfit > 0.1) {
                    const totalFees = feePerTrade * 2;
                    const feePercentage = (totalFees / investmentAmount) * 100;
                    const adjustedProfit = Math.max(0, potentialProfit - feePercentage);

                    const opp: ArbitrageOpportunity = {
                        tokenA: tokenA.tokenContractAddress,
                        tokenB: tokenB.tokenContractAddress,
                        priceA,
                        priceB,
                        potentialProfit,
                        adjustedProfit,
                        volatilityScore,
                        priceChangeA,
                        priceChangeB,
                        riskScore: 0,
                        tokenASymbol: tokenMetadata.get(tokenA.tokenContractAddress)?.symbol,
                        tokenBSymbol: tokenMetadata.get(tokenB.tokenContractAddress)?.symbol,
                        estimatedFee: totalFees,
                    };
                    opp.riskScore = calculateRiskScore(opp);
                    opportunities.push(opp);
                }
            }
        }

        return opportunities.sort((a, b) => b.adjustedProfit - a.adjustedProfit);
    };

    const handleFetchOpportunities = async () => {
        setLoading(true);
        try {
            const tokenAddresses = customTokens
                ? customTokens.split(',').map(addr => addr.trim()).filter(addr => addr)
                : defaultTokens[chainIndex as keyof typeof defaultTokens] || defaultTokens["1"];

            const opps = await findArbitrageOpportunities(tokenAddresses);
            setOpportunities(opps);
        } catch (error) {
            console.error("Error fetching arbitrage opportunities:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchCandlesticks = async () => {
        if (!selectedToken) return;

        setLoading(true);
        setCandlestickError(null);
        try {
            const data = await fetchCandlestickData(selectedToken);
            setCandlestickData(data);
        } catch (error) {
            setCandlestickError(error instanceof Error ? error.message : "Failed to fetch candlestick data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleFetchOpportunities();
        const interval = setInterval(handleFetchOpportunities, 30000);
        return () => clearInterval(interval);
    }, [chainIndex, investmentAmount]);

    useEffect(() => {
        if (selectedToken) {
            handleFetchCandlesticks();
        }
    }, [selectedToken, timeframe]);

    const chartData = candlestickData.map(candle => ({
        x: new Date(candle.ts),
        y: [candle.o, candle.h, candle.l, candle.c],
        volume: candle.volUsd,
    }));

    const volumeChartData = candlestickData.map(candle => ({
        time: new Date(candle.ts).toLocaleString(),
        volume: candle.volUsd,
    }));

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    const bestOpportunity = opportunities.length > 0 ? opportunities[0] : null;

    return (
        <div className={`p-6 min-h-screen ${theme === "dark" ? "bg-gradient-to-br from-gray-900 to-gray-800 text-white" : "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-900"} transition-all duration-300`}>
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        Smart Arbitrage Dashboard
                    </h1>
                    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-700 transition-all">
                        {theme === "dark" ? <SunIcon className="w-6 h-6 text-yellow-400" /> : <MoonIcon className="w-6 h-6 text-gray-800" />}
                    </button>
                </div>

                {bestOpportunity && (
                    <div className={`p-6 rounded-lg border mb-8 ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-semibold mb-2">Best Opportunity</h3>
                                <p className="text-lg">
                                    {bestOpportunity.tokenASymbol || bestOpportunity.tokenA.slice(0, 10) + "..."} ↔{" "}
                                    {bestOpportunity.tokenBSymbol || bestOpportunity.tokenB.slice(0, 10) + "..."}
                                </p>
                                <p className="text-green-400">Adjusted Profit: {bestOpportunity.adjustedProfit.toFixed(4)}%</p>
                                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                                    Estimated Profit for ${investmentAmount}: ${(investmentAmount * (bestOpportunity.adjustedProfit / 100)).toFixed(2)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Risk Score</p>
                                <p className={`font-medium ${bestOpportunity.riskScore > 70 ? "text-red-400" : bestOpportunity.riskScore > 40 ? "text-yellow-400" : "text-green-400"}`}>
                                    {bestOpportunity.riskScore.toFixed(0)}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                    <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <label className="block text-sm font-medium mb-2">Chain</label>
                        <select
                            value={chainIndex}
                            onChange={(e) => setChainIndex(e.target.value)}
                            className={`w-full p-2 rounded focus:ring-2 focus:ring-blue-500 ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-100 border-gray-300"}`}
                        >
                            <option value="1">Ethereum</option>
                            <option value="56">BSC</option>
                            <option value="137">Polygon</option>
                        </select>
                    </div>

                    <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <label className="block text-sm font-medium mb-2">Timeframe</label>
                        <select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                            className={`w-full p-2 rounded focus:ring-2 focus:ring-blue-500 ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-100 border-gray-300"}`}
                        >
                            <option value="1m">1 Minute</option>
                            <option value="5m">5 Minutes</option>
                            <option value="15m">15 Minutes</option>
                            <option value="1H">1 Hour</option>
                            <option value="4H">4 Hours</option>
                            <option value="1D">1 Day</option>
                        </select>
                    </div>

                    <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <label className="block text-sm font-medium mb-2">Token for Chart</label>
                        <input
                            type="text"
                            value={selectedToken}
                            onChange={(e) => setSelectedToken(e.target.value)}
                            placeholder="Token contract address"
                            className={`w-full p-2 rounded focus:ring-2 focus:ring-blue-500 ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-100 border-gray-300"}`}
                        />
                    </div>

                    <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <label className="block text-sm font-medium mb-2 flex items-center">
                            Investment Amount (USD)
                            <span className="relative group ml-1">
                                <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                                <span className={`absolute bottom-full mb-2 hidden group-hover:block text-xs p-2 rounded ${theme === "dark" ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-700"}`}>
                                    Amount to invest for profit estimation
                                </span>
                            </span>
                        </label>
                        <input
                            type="number"
                            value={investmentAmount}
                            onChange={(e) => setInvestmentAmount(parseFloat(e.target.value) || 0)}
                            placeholder="1000"
                            className={`w-full p-2 rounded focus:ring-2 focus:ring-blue-500 ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-100 border-gray-300"}`}
                        />
                    </div>

                    <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <button
                            onClick={handleFetchOpportunities}
                            disabled={loading}
                            className={`w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 px-4 py-2 rounded font-medium transition-all duration-200 ${theme === "dark" ? "text-white" : "text-gray-900"}`}
                        >
                            {loading ? "Loading..." : "Refresh Data"}
                        </button>
                    </div>
                </div>

                <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"} mb-8`}>
                    <label className="block text-sm font-medium mb-2">Custom Token Addresses (comma-separated)</label>
                    <textarea
                        value={customTokens}
                        onChange={(e) => setCustomTokens(e.target.value)}
                        placeholder="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2, 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48..."
                        className={`w-full p-3 rounded focus:ring-2 focus:ring-blue-500 h-24 resize-none ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-100 border-gray-300"}`}
                    />
                    <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Leave empty to use default tokens for selected chain</p>
                </div>

                {candlestickError ? (
                    <div className={`p-6 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"} mb-8 text-red-400`}>
                        <h3 className="text-xl font-semibold mb-4">Candlestick Chart Error</h3>
                        <p>{candlestickError}</p>
                        <p className="text-sm mt-2">Please check the token address and chain, or try a different token.</p>
                    </div>
                ) : candlestickData.length > 0 ? (
                    <div className={`p-6 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"} mb-8`}>
                        <h3 className="text-xl font-semibold mb-4">Candlestick Chart</h3>
                        <div className="h-96">
                            <Chart
                                options={{
                                    chart: {
                                        type: 'candlestick',
                                        background: theme === "dark" ? '#1F2937' : '#FFFFFF',
                                        height: 350,
                                    },
                                    title: {
                                        text: `${tokenMetadata.get(selectedToken)?.symbol || 'Token'} Price`,
                                        align: 'left',
                                        style: {
                                            color: theme === "dark" ? "#FFFFFF" : "#1F2937",
                                        },
                                    },
                                    xaxis: {
                                        type: 'datetime',
                                        labels: {
                                            style: {
                                                colors: theme === "dark" ? "#9CA3AF" : "#4B5563",
                                            },
                                        },
                                    },
                                    yaxis: [
                                        {
                                            title: {
                                                text: 'Price (USD)',
                                                style: {
                                                    color: theme === "dark" ? "#9CA3AF" : "#4B5563",
                                                },
                                            },
                                            labels: {
                                                style: {
                                                    colors: theme === "dark" ? "#9CA3AF" : "#4B5563",
                                                },
                                            },
                                        },
                                        {
                                            opposite: true,
                                            title: {
                                                text: 'Volume (USD)',
                                                style: {
                                                    color: theme === "dark" ? "#9CA3AF" : "#4B5563",
                                                },
                                            },
                                            labels: {
                                                style: {
                                                    colors: theme === "dark" ? "#9CA3AF" : "#4B5563",
                                                },
                                            },
                                        },
                                    ],
                                    plotOptions: {
                                        candlestick: {
                                            colors: {
                                                upward: theme === "dark" ? "#34D399" : "#10B981",
                                                downward: theme === "dark" ? "#EF4444" : "#F87171",
                                            },
                                        },
                                    },
                                    tooltip: {
                                        theme: theme === "dark" ? "dark" : "light",
                                    },
                                }}
                                series={[
                                    {
                                        name: 'Price',
                                        type: 'candlestick',
                                        data: chartData,
                                    },
                                    {
                                        name: 'Volume',
                                        type: 'bar',
                                        data: chartData.map(d => ({
                                            x: d.x,
                                            y: d.volume,
                                        })),
                                    },
                                ]}
                                type="candlestick"
                                height="100%"
                            />
                        </div>
                    </div>
                ) : selectedToken && (
                    <div className={`p-6 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"} mb-8 text-gray-400`}>
                        <h3 className="text-xl font-semibold mb-4">Candlestick Chart</h3>
                        <p>No candlestick data to display. Please select a token and click "Refresh Data".</p>
                    </div>
                )}

                <div className={`p-6 rounded-lg border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                    <h3 className="text-xl font-semibold mb-4">Arbitrage Opportunities</h3>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span className="ml-2">Loading opportunities...</span>
                        </div>
                    ) : opportunities.length > 0 ? (
                        <div className="grid gap-4">
                            {opportunities.slice(0, 10).map((opp, index) => (
                                <div
                                    key={index}
                                    className={`p-4 rounded-lg border transition-all duration-200 transform hover:scale-105 ${theme === "dark" ? "bg-gray-700 border-gray-600 hover:border-blue-500" : "bg-gray-50 border-gray-200 hover:border-blue-400"}`}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                        <div>
                                            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Token A</p>
                                            <p className="font-mono text-sm">{opp.tokenASymbol || opp.tokenA.slice(0, 10) + "..."}</p>
                                            <p className="text-green-400">${opp.priceA.toFixed(6)}</p>
                                            <p className={`text-xs ${opp.priceChangeA >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                {opp.priceChangeA >= 0 ? '+' : ''}{opp.priceChangeA.toFixed(2)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Token B</p>
                                            <p className="font-mono text-sm">{opp.tokenBSymbol || opp.tokenB.slice(0, 10) + "..."}</p>
                                            <p className="text-green-400">${opp.priceB.toFixed(6)}</p>
                                            <p className={`text-xs ${opp.priceChangeB >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                {opp.priceChangeB >= 0 ? '+' : ''}{opp.priceChangeB.toFixed(2)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Potential Profit</p>
                                            <p className="text-yellow-400 font-semibold text-lg">{opp.potentialProfit.toFixed(4)}%</p>
                                            <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>After Fees: {opp.adjustedProfit.toFixed(4)}%</p>
                                        </div>
                                        <div>
                                            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Est. Profit</p>
                                            <p className="text-green-400 font-medium">${(investmentAmount * (opp.adjustedProfit / 100)).toFixed(2)}</p>
                                            <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Fees: ${opp.estimatedFee.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Volatility Score</p>
                                            <p className="text-blue-400 font-medium">{opp.volatilityScore.toFixed(2)}</p>
                                            <div className={`w-full rounded-full h-2 mt-1 ${theme === "dark" ? "bg-gray-600" : "bg-gray-300"}`}>
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full"
                                                    style={{ width: `${Math.min(opp.volatilityScore * 2, 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Risk Score</p>
                                            <p className={`font-medium ${opp.riskScore > 70 ? "text-red-400" : opp.riskScore > 40 ? "text-yellow-400" : "text-green-400"}`}>
                                                {opp.riskScore.toFixed(0)}
                                            </p>
                                            <div className={`w-full rounded-full h-2 mt-1 ${theme === "dark" ? "bg-gray-600" : "bg-gray-300"}`}>
                                                <div
                                                    className={`${opp.riskScore > 70 ? "bg-red-500" : opp.riskScore > 40 ? "bg-yellow-500" : "bg-green-500"} h-2 rounded-full`}
                                                    style={{ width: `${opp.riskScore}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={`text-center py-8 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                            <p>No arbitrage opportunities found.</p>
                            <p className="text-sm mt-2">Try adjusting your token selection or chain.</p>
                        </div>
                    )}
                </div>

                {candlestickData.length > 0 && (
                    <div className={`p-6 rounded-lg border mt-8 ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}>
                        <h3 className="text-xl font-semibold mb-4">Volume Chart</h3>
                        <div className="h-60">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={volumeChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#374151" : "#D1D5DB"} />
                                    <XAxis dataKey="time" stroke={theme === "dark" ? "#9CA3AF" : "#4B5563"} />
                                    <YAxis stroke={theme === "dark" ? "#9CA3AF" : "#4B5563"} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: theme === "dark" ? '#1F2937' : '#F3F4F6',
                                            border: `1px solid ${theme === "dark" ? "#374151" : "#D1D5DB"}`,
                                            borderRadius: '8px',
                                            color: theme === "dark" ? "#FFFFFF" : "#1F2937",
                                        }}
                                    />
                                    <Bar dataKey="volume" fill={theme === "dark" ? "#8B5CF6" : "#A78BFA"} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}