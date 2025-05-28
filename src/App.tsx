import { useState, useEffect } from "react";
import { Zap, Settings, TrendingUp, Brain, Sparkles, Menu, X, ChevronRight, Activity, Layers, Binary } from "lucide-react";
import SwapForm from "./components/SwapForm";
import SettingsModal from "./components/SettingsModal";
import KOLAnalysis from "./components/KOLAnalysis";
import ArbitrageOpportunities from "./components/Arbitrage";
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana/react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana, solanaTestnet, solanaDevnet } from "@reown/appkit/networks";
import './App.css';

// Initialize Solana Connection
const connection = new Connection("https://api.mainnet-beta.solana.com", {
  confirmTransactionInitialTimeout: 30000,
});

const solanaWeb3JsAdapter = new SolanaAdapter();

// 1. Get projectId from https://cloud.reown.com
const projectId = "341513fbc5462fa836977524eba17c23";

// 2. Create a metadata object - optional
const metadata = {
  name: "AppKit",
  description: "AppKit Solana Example",
  url: "https://example.com", // origin must match your domain & subdomain
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

// 3. Create modal
createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana, solanaTestnet, solanaDevnet],
  metadata: metadata,
  projectId,
  features: {
    analytics: true, // Optional - defaults to your Cloud configuration
  },
});

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"swap" | "arbitrage" | "kol">("swap");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);

  // Use correct hooks for wallet information
  useAppKit(); // For modal control
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');

  // Enhanced balance fetching with loading states
  useEffect(() => {
    const fetchBalance = async () => {
      if (isConnected && address && walletProvider) {
        setIsLoading(true);
        try {
          const wallet = new PublicKey(address);
          const walletBalance = await connection.getBalance(wallet); // Get the amount in LAMPORTS
          const balanceInSOL = walletBalance / LAMPORTS_PER_SOL; // Convert to SOL
          setBalance(balanceInSOL.toFixed(4));
        } catch (error) {
          console.error('Error fetching balance:', error);
          setBalance('0');
        } finally {
          setIsLoading(false);
        }
      } else {
        setBalance('0');
      }
    };
    fetchBalance();
  }, [isConnected, address, walletProvider]);

  const tabs = [
    {
      id: "swap" as const,
      label: "Quantum Swap",
      description: "Lightning-fast token exchanges",
      icon: Zap,
      gradient: "from-cyan-400 via-blue-500 to-purple-600",
      bgGlow: "from-cyan-500/30 to-purple-500/30",
      shadowColor: "shadow-cyan-500/25",
    },
    {
      id: "arbitrage" as const,
      label: "Neural Arbitrage",
      description: "AI-powered profit opportunities",
      icon: TrendingUp,
      gradient: "from-emerald-400 via-teal-500 to-cyan-600",
      bgGlow: "from-emerald-500/30 to-cyan-500/30",
      shadowColor: "shadow-emerald-500/25",
    },
    {
      id: "kol" as const,
      label: "KOL Intelligence",
      description: "Advanced market sentiment analysis",
      icon: Brain,
      gradient: "from-purple-400 via-violet-500 to-indigo-600",
      bgGlow: "from-purple-500/30 to-indigo-500/30",
      shadowColor: "shadow-purple-500/25",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-slate-950 relative overflow-hidden">
      {/* Advanced Animated Background Grid */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Dynamic Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,246,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,246,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] animate-pulse"></div>
        
        {/* Floating Geometric Elements */}
        <div className="absolute top-20 left-10 w-40 h-40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-56 h-56 bg-gradient-to-r from-purple-500/15 to-pink-500/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-32 left-1/4 w-48 h-48 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
        
        {/* Tech Elements */}
        <div className="absolute top-1/4 right-1/3 opacity-5">
          <Binary className="w-72 h-72 text-cyan-400 animate-spin" style={{ animationDuration: '30s' }} />
        </div>
        <div className="absolute bottom-1/3 left-1/3 opacity-5">
          <Layers className="w-64 h-64 text-purple-400 animate-bounce" style={{ animationDuration: '4s' }} />
        </div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-5">
          <Activity className="w-96 h-96 text-emerald-400 animate-pulse" />
        </div>
        
        {/* Scanning Lines */}
        <div className="absolute inset-0">
          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent animate-pulse" 
               style={{ top: '25%', animationDuration: '3s' }}></div>
          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent animate-pulse delay-1000" 
               style={{ top: '75%', animationDuration: '3s' }}></div>
        </div>
      </div>

      {/* Main Interface Container */}
      <div className="relative z-10 min-h-screen p-4 sm:p-6 lg:p-8">
        {/* Enhanced Header with Holographic Effect */}
        <div className="relative mb-8">
          <div className="absolute -inset-6 bg-gradient-to-r from-cyan-500/10 via-purple-500/15 to-emerald-500/10 rounded-3xl blur-2xl animate-pulse"></div>
          <div className="relative bg-black/60 backdrop-blur-3xl border border-white/20 rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="absolute -inset-3 bg-gradient-to-r from-cyan-400 via-purple-500 to-emerald-400 rounded-3xl blur-lg opacity-75 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative bg-gradient-to-r from-cyan-500 via-purple-600 to-emerald-500 p-4 rounded-3xl shadow-2xl">
                    <Sparkles className="w-10 h-10 text-white animate-pulse" />
                  </div>
                  {/* Orbiting Elements */}
                  <div className="absolute -inset-8 animate-spin" style={{ animationDuration: '20s' }}>
                    <div className="absolute top-0 left-1/2 w-2 h-2 bg-cyan-400 rounded-full transform -translate-x-1/2"></div>
                  </div>
                </div>
                <div>
                  <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-cyan-200 to-purple-200 bg-clip-text text-transparent">
                    Calieo
                  </h1>
                  <p className="text-gray-400 text-base font-medium mt-1">Quantum DeFi Protocol • Neural Trading Engine</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-xs text-emerald-400 font-medium">SYSTEM ONLINE</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <appkit-button />
                <button
                  onClick={() => setShowSettings(true)}
                  className="relative group p-4 bg-white/5 backdrop-blur-xl hover:bg-white/10 border border-white/30 rounded-2xl transition-all duration-300 hover:scale-105 hover:rotate-3"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/50 to-purple-500/50 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <Settings className="relative w-6 h-6 text-gray-300 group-hover:text-white group-hover:rotate-45 transition-all duration-500" />
                </button>
                
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="sm:hidden relative group p-4 bg-white/5 backdrop-blur-xl hover:bg-white/10 border border-white/30 rounded-2xl transition-all duration-300"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/50 to-pink-500/50 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  {showMobileMenu ? 
                    <X className="relative w-6 h-6 text-gray-300 group-hover:text-white transition-colors duration-300" /> : 
                    <Menu className="relative w-6 h-6 text-gray-300 group-hover:text-white transition-colors duration-300" />
                  }
                </button>
              </div>
            </div>
            
            {/* Enhanced Wallet Info Display */}
            {isConnected && address && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-2xl border border-white/10">
                      <Activity className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm font-medium">Connected Wallet</p>
                      <p className="text-white font-mono text-sm">{address.slice(0, 8)}...{address.slice(-6)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl border border-white/10">
                      <Layers className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm font-medium">Portfolio Balance</p>
                      <p className="text-white font-mono text-lg font-bold">
                        {isLoading ? (
                          <span className="animate-pulse">Loading...</span>
                        ) : (
                          `${balance} SOL`
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Revolutionary Tab Navigation */}
        <div className="mb-8 relative">
          <div className="hidden sm:block">
            <div className="relative bg-black/40 backdrop-blur-2xl border border-white/20 rounded-3xl p-3">
              <div className="grid grid-cols-3 gap-3">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative group flex flex-col items-center gap-3 p-6 rounded-2xl font-semibold transition-all duration-500 transform hover:scale-105 ${
                        isActive ? 'text-white scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {isActive && (
                        <>
                          <div className={`absolute -inset-2 bg-gradient-to-r ${tab.bgGlow} rounded-2xl blur-xl opacity-100 animate-pulse`}></div>
                          <div className={`absolute inset-0 bg-gradient-to-r ${tab.gradient} rounded-2xl opacity-90 ${tab.shadowColor} shadow-2xl`}></div>
                        </>
                      )}
                      
                      <div className={`relative p-4 rounded-2xl transition-all duration-300 ${
                        isActive ? 'bg-white/10 backdrop-blur-sm' : 'bg-white/5 group-hover:bg-white/10'
                      }`}>
                        <Icon className={`w-8 h-8 transition-all duration-300 ${
                          isActive ? 'text-white animate-pulse' : 'text-gray-400 group-hover:text-white'
                        }`} />
                      </div>
                      
                      <div className="relative text-center">
                        <span className="block text-lg font-bold">{tab.label}</span>
                        <span className="block text-xs opacity-70 mt-1">{tab.description}</span>
                      </div>
                      
                      {isActive && (
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
                          <div className="w-3 h-3 bg-white/80 rounded-full animate-bounce"></div>
                        </div>
                      )}
                      
                      {!isActive && (
                        <div className={`absolute -inset-2 bg-gradient-to-r ${tab.bgGlow} rounded-2xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500`}></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Enhanced Mobile Menu */}
          <div className={`sm:hidden transition-all duration-500 ${showMobileMenu ? 'opacity-100 max-h-96 scale-100' : 'opacity-0 max-h-0 scale-95 overflow-hidden'}`}>
            <div className="bg-black/60 backdrop-blur-3xl border border-white/20 rounded-3xl p-6 space-y-3">
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
                    className={`relative w-full group flex items-center gap-4 px-6 py-4 rounded-2xl font-medium transition-all duration-300 ${
                      isActive ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {isActive && (
                      <>
                        <div className={`absolute -inset-1 bg-gradient-to-r ${tab.bgGlow} rounded-2xl blur opacity-100`}></div>
                        <div className={`absolute inset-0 bg-gradient-to-r ${tab.gradient} rounded-2xl opacity-90`}></div>
                      </>
                    )}
                    <div className={`relative p-2 rounded-xl ${isActive ? 'bg-white/20' : 'bg-white/10'}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="relative flex-1 text-left">
                      <span className="block font-bold">{tab.label}</span>
                      <span className="block text-xs opacity-70">{tab.description}</span>
                    </div>
                    <ChevronRight className="relative w-5 h-5 opacity-50" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile Active Tab Indicator */}
          <div className="sm:hidden mt-4">
            <div className="bg-black/40 backdrop-blur-2xl border border-white/20 rounded-2xl p-4">
              <div className="flex items-center justify-center gap-4">
                {(() => {
                  const currentTab = tabs.find(tab => tab.id === activeTab);
                  const Icon = currentTab?.icon || Zap;
                  return (
                    <>
                      <div className={`p-3 rounded-2xl bg-gradient-to-r ${currentTab?.gradient || 'from-cyan-400 to-purple-600'} shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <span className="text-white font-bold text-lg block">{currentTab?.label}</span>
                        <span className="text-gray-400 text-sm">{currentTab?.description}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Tab Content with Smooth Transitions */}
        <div className="relative">
          <div className="transition-all duration-500 ease-in-out">
            {activeTab === "swap" && (
              <div className="space-y-6 animate-fade-in">
                <SwapForm walletProvider={walletProvider} balance={balance} />
              </div>
            )}
            {activeTab === "arbitrage" && (
              <div className="animate-fade-in">
                <ArbitrageOpportunities />
              </div>
            )}
            {activeTab === "kol" && (
              <div className="animate-fade-in">
                <KOLAnalysis />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}