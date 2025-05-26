import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Zap, Settings, TrendingUp, Brain, Sparkles, Grid3X3, Cpu, Waves, Menu, X } from "lucide-react";
import WalletConnect from "./components/WalletConnect";
import SwapForm from "./components/SwapForm";
import TransactionStatus from "./components/TransactionStatus";
import SettingsModal from "./components/SettingsModal";
import KOLAnalysis from "./components/KOLAnalysis";
import { executeSwap , type SwapResult } from "./lib/solana-swap";
import ArbitrageOpportunities from "./components/Arbitrage";

// Telegram Web Apps SDK (Loaded via script tag in index.html)
declare global {
    interface Window {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Telegram: any;
    }
}

export default function App() {
    const walletContext = useWallet();
    const [txResult, setTxResult] = useState<SwapResult | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [activeTab, setActiveTab] = useState<"swap" | "arbitrage" | "kol">("swap");
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    useEffect(() => {
        // Initialize Telegram Web App
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
        }
    }, []);

    const handleSwap = async (fromToken: string, toToken: string, amount: string, slippage: string): Promise<SwapResult> => {
        const result = await executeSwap(fromToken, toToken, amount, walletContext, slippage);
        setTxResult(result);
        return result;
    };

    const tabs = [
        { 
            id: "swap" as const, 
            label: "Swap", 
            icon: Zap, 
            gradient: "from-cyan-400 via-blue-500 to-purple-600",
            bgGlow: "from-cyan-500/20 to-purple-500/20"
        },
        { 
            id: "arbitrage" as const, 
            label: "Arbitrage", 
            icon: TrendingUp, 
            gradient: "from-orange-400 via-red-500 to-pink-600",
            bgGlow: "from-orange-500/20 to-pink-500/20"
        },
        { 
            id: "kol" as const, 
            label: "KOL Analysis", 
            icon: Brain, 
            gradient: "from-purple-400 via-violet-500 to-indigo-600",
            bgGlow: "from-purple-500/20 to-indigo-500/20"
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Floating Orbs */}
                <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-full blur-2xl animate-pulse"></div>
                <div className="absolute top-40 right-20 w-48 h-48 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-gradient-to-r from-orange-500/25 to-red-500/25 rounded-full blur-2xl animate-pulse delay-2000"></div>
                
                {/* Geometric Patterns */}
                <div className="absolute top-1/4 right-1/4 opacity-10">
                    <Grid3X3 className="w-64 h-64 text-white animate-spin" style={{ animationDuration: '20s' }} />
                </div>
                <div className="absolute bottom-1/4 left-1/4 opacity-10">
                    <Cpu className="w-48 h-48 text-cyan-400 animate-pulse" />
                </div>
                
                {/* Flowing Lines */}
                <div className="absolute inset-0 opacity-20">
                    <Waves className="w-full h-full text-blue-400" style={{ filter: 'blur(1px)' }} />
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 min-h-screen p-4 sm:p-6 lg:p-8">
                {/* Header */}
                <div className="relative mb-8">
                    {/* Header Background Glow */}
                    <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-xl"></div>
                    
                    <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center">
                            {/* Logo Section */}
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="absolute -inset-2 bg-gradient-to-r from-cyan-400 to-purple-600 rounded-2xl blur opacity-75"></div>
                                    <div className="relative bg-gradient-to-r from-cyan-500 to-purple-600 p-3 rounded-2xl">
                                        <Sparkles className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-cyan-200 to-purple-200 bg-clip-text text-transparent">
                                        Calieo Swap
                                    </h1>
                                    <p className="text-gray-400 text-sm">Next-Gen DeFi Protocol</p>
                                </div>
                            </div>

                            {/* Settings & Mobile Menu */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowSettings(true)}
                                    className="relative group p-3 bg-white/5 backdrop-blur-sm hover:bg-white/10 border border-white/20 rounded-xl transition-all duration-300 hover:scale-105"
                                >
                                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/50 to-purple-500/50 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    <Settings className="relative w-5 h-5 text-gray-300 group-hover:text-white group-hover:rotate-45 transition-all duration-300" />
                                </button>
                                
                                <button
                                    onClick={() => setShowMobileMenu(!showMobileMenu)}
                                    className="sm:hidden relative group p-3 bg-white/5 backdrop-blur-sm hover:bg-white/10 border border-white/20 rounded-xl transition-all duration-300"
                                >
                                    {showMobileMenu ? 
                                        <X className="w-5 h-5 text-gray-300" /> : 
                                        <Menu className="w-5 h-5 text-gray-300" />
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Wallet Connection */}
                <div className="mb-8">
                    <WalletConnect onConnect={() => setTxResult(null)} />
                </div>

                {/* Tab Navigation */}
                <div className="mb-8 relative">
                    {/* Desktop Navigation */}
                    <div className="hidden sm:block">
                        <div className="relative bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-2">
                            <div className="flex gap-2">
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`relative flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold transition-all duration-300 group ${
                                                isActive 
                                                    ? 'text-white' 
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                            }`}
                                        >
                                            {/* Active Tab Background */}
                                            {isActive && (
                                                <>
                                                    <div className={`absolute -inset-1 bg-gradient-to-r ${tab.bgGlow} rounded-xl blur opacity-75`}></div>
                                                    <div className={`absolute inset-0 bg-gradient-to-r ${tab.gradient} rounded-xl opacity-90`}></div>
                                                </>
                                            )}
                                            
                                            {/* Icon and Text */}
                                            <Icon className={`relative w-5 h-5 transition-all duration-300 ${
                                                isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                                            }`} />
                                            <span className="relative">{tab.label}</span>
                                            
                                            {/* Hover Glow Effect */}
                                            {!isActive && (
                                                <div className={`absolute -inset-1 bg-gradient-to-r ${tab.bgGlow} rounded-xl blur opacity-0 group-hover:opacity-30 transition-opacity duration-300`}></div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Navigation */}
                    <div className={`sm:hidden transition-all duration-300 ${showMobileMenu ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 space-y-2">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            setShowMobileMenu(false);
                                        }}
                                        className={`relative w-full flex items-center gap-4 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                                            isActive 
                                                ? 'text-white' 
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {isActive && (
                                            <>
                                                <div className={`absolute -inset-1 bg-gradient-to-r ${tab.bgGlow} rounded-xl blur opacity-75`}></div>
                                                <div className={`absolute inset-0 bg-gradient-to-r ${tab.gradient} rounded-xl opacity-90`}></div>
                                            </>
                                        )}
                                        
                                        <Icon className="relative w-5 h-5" />
                                        <span className="relative">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Mobile Tab Indicator */}
                    <div className="sm:hidden mt-4">
                        <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-xl p-3">
                            <div className="flex items-center justify-center gap-3">
                                {(() => {
                                    const currentTab = tabs.find(tab => tab.id === activeTab);
                                    const Icon = currentTab?.icon || Zap;
                                    return (
                                        <>
                                            <div className={`p-2 rounded-lg bg-gradient-to-r ${currentTab?.gradient || 'from-cyan-400 to-purple-600'}`}>
                                                <Icon className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-white font-semibold">{currentTab?.label}</span>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="relative">
                    {activeTab === "swap" && (
                        <div className="space-y-6">
                            <SwapForm onSwap={handleSwap} />
                            <TransactionStatus txResult={txResult} />
                        </div>
                    )}
                    {activeTab === "arbitrage" && <ArbitrageOpportunities />}
                    {activeTab === "kol" && <KOLAnalysis />}
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
    );
}