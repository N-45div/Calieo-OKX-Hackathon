import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

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
    volatilityScore: number;
    priceChangeA: number;
    priceChangeB: number;
}

export default function ArbitrageOpportunities() {
    const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
    const [loading, setLoading] = useState(false);
    const [candlestickData, setCandlestickData] = useState<CandlestickData[]>([]);
    const [selectedToken, setSelectedToken] = useState("");
    const [chainIndex, setChainIndex] = useState("1");
    const [customTokens, setCustomTokens] = useState("");
    const [timeframe, setTimeframe] = useState("1H");

    // Default token addresses for different chains
    const defaultTokens = {
        "1": [ // Ethereum
            "0xA0b86a33E6441c5c9fe87bb667bd6d3e4D4e3f6a", // WETH
            "0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b", // USDC
            "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
            "0x514910771AF9Ca656af840dff83E8264EcF986CA", // LINK
            "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI
        ],
        "56": [ // BSC
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
            "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
            "0x55d398326f99059fF775485246999027B3197955", // USDT
        ]
    };

    const fetchBatchTokenPrices = async (tokenAddresses: string[]) => {
        try {
            const response = await fetch('https://web3.okx.com/api/v5/dex/market/price-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Note: Authentication headers removed; this should be routed through the backend
                },
                body: JSON.stringify({
                    chainIndex: chainIndex,
                    tokenContractAddress: tokenAddresses.join(',')
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error('Error fetching batch token prices:', error);
            // Return mock data for demonstration
            return tokenAddresses.map((address) => ({
                chainIndex: chainIndex,
                tokenContractAddress: address,
                time: Date.now().toString(),
                price: (Math.random() * 1000 + 1).toFixed(6),
                marketCap: (Math.random() * 1000000000).toFixed(0),
                priceChange24H: ((Math.random() - 0.5) * 20).toFixed(2),
                volume24H: (Math.random() * 10000000).toFixed(0)
            }));
        }
    };

    const fetchCandlestickData = async (tokenAddress: string) => {
        try {
            // Call the backend endpoint instead of directly hitting the OKX API
            const params = new URLSearchParams({
                chainIndex,
                tokenContractAddress: tokenAddress,
                bar: timeframe,
                limit: "100",
            });

            const response = await fetch(`/api/market/candles?${params.toString()}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || "Failed to fetch candlestick data");
            }

            // Transform the data to match CandlestickData interface
            const candlesticks = (result.data || []).map((candle: CandlestickData) => ({
                ts: candle.ts,
                o: candle.o,
                h: candle.h,
                l: candle.l,
                c: candle.c,
                vol: candle.vol,
                volUsd: candle.volUsd,
                confirm: candle.confirm,
            }));

            return candlesticks;
        } catch (error) {
            console.error('Error fetching candlestick data:', error);
            // Return mock candlestick data
            const mockData = [];
            const now = Date.now();
            for (let i = 99; i >= 0; i--) {
                const basePrice = 100 + Math.random() * 50;
                const open = basePrice + (Math.random() - 0.5) * 10;
                const close = open + (Math.random() - 0.5) * 5;
                const high = Math.max(open, close) + Math.random() * 3;
                const low = Math.min(open, close) - Math.random() * 3;
                
                mockData.push({
                    ts: now - (i * 3600000), // 1 hour intervals
                    o: open,
                    h: high,
                    l: low,
                    c: close,
                    vol: Math.random() * 1000,
                    volUsd: Math.random() * 100000,
                    confirm: 1
                });
            }
            return mockData;
        }
    };

    const findArbitrageOpportunities = async (tokenAddresses: string[]) => {
        const prices = await fetchBatchTokenPrices(tokenAddresses);
        const opportunities: ArbitrageOpportunity[] = [];

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
                
                // Calculate volatility score based on price changes
                const volatilityScore = (Math.abs(priceChangeA) + Math.abs(priceChangeB)) / 2;
                
                if (potentialProfit > 0.1) { // Only show opportunities with >0.1% potential profit
                    opportunities.push({
                        tokenA: tokenA.tokenContractAddress,
                        tokenB: tokenB.tokenContractAddress,
                        priceA,
                        priceB,
                        potentialProfit,
                        volatilityScore,
                        priceChangeA,
                        priceChangeB
                    });
                }
            }
        }

        return opportunities.sort((a, b) => b.potentialProfit - a.potentialProfit);
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
        try {
            const data = await fetchCandlestickData(selectedToken);
            setCandlestickData(data);
        } catch (error) {
            console.error("Error fetching candlestick data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleFetchOpportunities();
    }, [chainIndex]);

    useEffect(() => {
        if (selectedToken) {
            handleFetchCandlesticks();
        }
    }, [selectedToken, timeframe]);

    // Format candlestick data for chart
    const chartData = candlestickData.map(candle => ({
        time: new Date(candle.ts).toLocaleTimeString(),
        price: candle.c,
        volume: candle.volUsd,
        high: candle.h,
        low: candle.l,
    }));

    return (
        <div className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 min-h-screen text-white">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Dynamic Arbitrage Opportunities Dashboard
                </h1>

                {/* Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <label className="block text-sm font-medium mb-2">Chain</label>
                        <select 
                            value={chainIndex} 
                            onChange={(e) => setChainIndex(e.target.value)}
                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="1">Ethereum</option>
                            <option value="56">BSC</option>
                            <option value="137">Polygon</option>
                        </select>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <label className="block text-sm font-medium mb-2">Timeframe</label>
                        <select 
                            value={timeframe} 
                            onChange={(e) => setTimeframe(e.target.value)}
                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="1m">1 Minute</option>
                            <option value="5m">5 Minutes</option>
                            <option value="15m">15 Minutes</option>
                            <option value="1H">1 Hour</option>
                            <option value="4H">4 Hours</option>
                            <option value="1D">1 Day</option>
                        </select>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <label className="block text-sm font-medium mb-2">Token for Chart</label>
                        <input
                            type="text"
                            value={selectedToken}
                            onChange={(e) => setSelectedToken(e.target.value)}
                            placeholder="Token contract address"
                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <button
                            onClick={handleFetchOpportunities}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 px-4 py-2 rounded font-medium transition-all duration-200"
                        >
                            {loading ? "Loading..." : "Refresh Data"}
                        </button>
                    </div>
                </div>

                {/* Custom Tokens Input */}
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mb-8">
                    <label className="block text-sm font-medium mb-2">Custom Token Addresses (comma-separated)</label>
                    <textarea
                        value={customTokens}
                        onChange={(e) => setCustomTokens(e.target.value)}
                        placeholder="0xA0b86a33E6441c5c9fe87bb667bd6d3e4D4e3f6a, 0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b..."
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">Leave empty to use default tokens for selected chain</p>
                </div>

                {/* Candlestick Chart */}
                {candlestickData.length > 0 && (
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-8">
                        <h3 className="text-xl font-semibold mb-4">Price Chart</h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="time" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#1F2937', 
                                            border: '1px solid #374151',
                                            borderRadius: '8px'
                                        }} 
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="price" 
                                        stroke="#3B82F6" 
                                        strokeWidth={2}
                                        dot={{ fill: '#3B82F6', strokeWidth: 2, r: 3 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Arbitrage Opportunities */}
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <h3 className="text-xl font-semibold mb-4">Arbitrage Opportunities</h3>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span className="ml-2">Loading opportunities...</span>
                        </div>
                    ) : opportunities.length > 0 ? (
                        <div className="grid gap-4">
                            {opportunities.slice(0, 10).map((opp, index) => (
                                <div key={index} className="bg-gray-700 p-4 rounded-lg border border-gray-600 hover:border-blue-500 transition-colors duration-200">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div>
                                            <p className="text-sm text-gray-400">Token A</p>
                                            <p className="font-mono text-sm">{opp.tokenA.slice(0, 10)}...</p>
                                            <p className="text-green-400">${opp.priceA.toFixed(6)}</p>
                                            <p className={`text-xs ${opp.priceChangeA >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {opp.priceChangeA >= 0 ? '+' : ''}{opp.priceChangeA.toFixed(2)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-400">Token B</p>
                                            <p className="font-mono text-sm">{opp.tokenB.slice(0, 10)}...</p>
                                            <p className="text-green-400">${opp.priceB.toFixed(6)}</p>
                                            <p className={`text-xs ${opp.priceChangeB >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {opp.priceChangeB >= 0 ? '+' : ''}{opp.priceChangeB.toFixed(2)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-400">Potential Profit</p>
                                            <p className="text-yellow-400 font-semibold text-lg">{opp.potentialProfit.toFixed(4)}%</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-400">Volatility Score</p>
                                            <p className="text-blue-400 font-medium">{opp.volatilityScore.toFixed(2)}</p>
                                            <div className="w-full bg-gray-600 rounded-full h-2 mt-1">
                                                <div 
                                                    className="bg-blue-500 h-2 rounded-full" 
                                                    style={{ width: `${Math.min(opp.volatilityScore * 2, 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <p>No arbitrage opportunities found.</p>
                            <p className="text-sm mt-2">Try adjusting your token selection or chain.</p>
                        </div>
                    )}
                </div>

                {/* Volume Chart */}
                {candlestickData.length > 0 && (
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mt-8">
                        <h3 className="text-xl font-semibold mb-4">Volume Chart</h3>
                        <div className="h-60">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="time" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#1F2937', 
                                            border: '1px solid #374151',
                                            borderRadius: '8px'
                                        }} 
                                    />
                                    <Bar dataKey="volume" fill="#8B5CF6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}