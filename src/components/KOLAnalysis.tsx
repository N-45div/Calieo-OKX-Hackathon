import { useState, useEffect } from "react";
import { Search, Zap, Activity, TrendingUp, AlertTriangle, Shield, Clock, ExternalLink, Copy, CheckCircle, Radar, Flame, Sparkles, BarChart3 } from "lucide-react";
import io, { Socket } from "socket.io-client";

// Backend URL (update with your actual backend URL)
const BACKEND_URL = "http://localhost:3001"; // Adjust based on your deployment

interface SolanaContract {
  address: string;
  symbol?: string;
  name?: string;
  deployedAt: Date;
  mentionedBy: string[];
  tweets: any[];
  riskScore: number;
  liquidityScore: number;
  socialScore: number;
  verified: boolean;
  marketCap?: number;
  holders?: number;
  description: string;
  tags: string[];
  dexData?: {
    price: number;
    volume24h: number;
    liquidity: number;
    priceChange24h: number;
    dexUrl: string;
  };
}

const RiskBadge = ({ score }: { score: number }) => {
  const getRiskColor = (score: number) => {
    if (score < 30) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-emerald-500/20';
    if (score < 70) return 'bg-amber-500/10 text-amber-300 border-amber-500/20 shadow-amber-500/20';
    return 'bg-red-500/10 text-red-300 border-red-500/20 shadow-red-500/20';
  };
  
  const getRiskText = (score: number) => {
    if (score < 30) return 'LOW RISK';
    if (score < 70) return 'MED RISK';
    return 'HIGH RISK';
  };
  
  return (
    <div className={`px-2 py-1 rounded-lg text-xs border backdrop-blur-sm shadow-lg ${getRiskColor(score)}`}>
      {getRiskText(score)} {score}%
    </div>
  );
};

const TagBadge = ({ tag }: { tag: string }) => {
  const colors: Record<string, string> = {
    'LOW_RISK': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    'HIGH_RISK': 'bg-red-500/10 text-red-300 border-red-500/20',
    'TRENDING': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    'ALPHA_HUNTER': 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    'FRESH': 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    'ULTRA_FRESH': 'bg-orange-600/10 text-orange-400 border-orange-600/20',
    'NEW': 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    'HIGH_VOLUME': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    'GOOD_LIQUIDITY': 'bg-teal-500/10 text-teal-300 border-teal-500/20',
    'PUMPING': 'bg-green-500/10 text-green-300 border-green-500/20',
    'DUMPING': 'bg-red-600/10 text-red-400 border-red-600/20',
    'VERIFIED': 'bg-emerald-600/10 text-emerald-400 border-emerald-600/20',
    'NO_DEX_DATA': 'bg-gray-500/10 text-gray-300 border-gray-500/20'
  };
  
  return (
    <span className={`px-2 py-1 rounded-md text-xs border backdrop-blur-sm ${colors[tag] || 'bg-slate-500/10 text-slate-300 border-slate-500/20'}`}>
      {tag.replace('_', ' ')}
    </span>
  );
};

const GlassCard = ({ children, className = "", hover = true }: { children: React.ReactNode, className?: string, hover?: boolean }) => (
  <div className={`
    bg-gradient-to-br from-slate-900/40 via-slate-800/30 to-slate-900/40 
    backdrop-blur-xl border border-slate-700/30 rounded-2xl 
    shadow-2xl shadow-black/20
    ${hover ? 'hover:border-slate-600/40 hover:shadow-3xl hover:shadow-black/30 hover:scale-[1.02] transition-all duration-300' : 'transition-all duration-200'}
    ${className}
  `}>
    {children}
  </div>
);

const StatCard = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: number, color: string }) => (
  <GlassCard className="p-4 sm:p-6" hover={false}>
    <div className="flex items-center gap-3 mb-2">
      <div className={`p-2 rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
      </div>
      <span className="text-xs sm:text-sm text-slate-400 font-medium">{label}</span>
    </div>
    <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
      {value.toLocaleString()}
    </p>
  </GlassCard>
);

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // You could add a toast notification here
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

export default function SolanaAlphaHunter() {
  const [contracts, setContracts] = useState<SolanaContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | 'low_risk' | 'trending' | 'fresh'>('all');
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const socketInstance = io(BACKEND_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(socketInstance);

    // Handle WebSocket connection
    socketInstance.on("connect", () => {
      console.log("Connected to WebSocket server:", socketInstance.id);
    });

    // Handle contracts update
    socketInstance.on("contracts-update", (data: { contracts: SolanaContract[], lastUpdate: string }) => {
      console.log("Received contracts update:", data);
      setContracts(data.contracts.map(contract => ({
        ...contract,
        deployedAt: new Date(contract.deployedAt),
      })));
      setLastUpdate(new Date(data.lastUpdate));
      setLoading(false);
    });

    // Handle scan status
    socketInstance.on("scan-status", (data: { inProgress: boolean, lastScan?: string, stage?: string }) => {
      console.log("Received scan status:", data);
      setLoading(data.inProgress);
      if (data.stage) {
        setScanStatus(data.stage);
      } else {
        setScanStatus(null);
      }
      if (data.lastScan) {
        setLastUpdate(new Date(data.lastScan));
      }
    });

    // Handle WebSocket errors
    socketInstance.on("connect_error", (error: Error) => {
      console.error("WebSocket connection error:", error);
      setLoading(false);
      setScanStatus("Failed to connect to server");
    });

    socketInstance.on("scan-error", (data: { error: string }) => {
      console.error("Scan error:", data.error);
      setLoading(false);
      setScanStatus(`Scan failed: ${data.error}`);
    });

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
      console.log("Disconnected from WebSocket server");
    };
  }, []);

  // Trigger manual scan
  const scanForContracts = () => {
    if (socket && !loading) {
      setLoading(true);
      setScanStatus("Initiating manual scan...");
      socket.emit("request-scan");
    }
  };

  const filteredContracts = contracts.filter(contract => {
    switch (filter) {
      case 'low_risk': return contract.riskScore < 40;
      case 'trending': return contract.tags.includes('TRENDING');
      case 'fresh': return contract.tags.includes('FRESH') || contract.tags.includes('ULTRA_FRESH') || contract.tags.includes('NEW');
      default: return true;
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-blue-500/10 to-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-violet-500/5 to-pink-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="relative">
                <Radar className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-400 animate-spin" />
                <div className="absolute inset-0 w-8 h-8 sm:w-10 sm:h-10 bg-cyan-400/20 rounded-full blur-xl animate-pulse"></div>
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Calieo Alpha Hunter
              </h1>
              <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 animate-pulse" />
            </div>
            <p className="text-slate-400 text-sm sm:text-lg max-w-4xl mx-auto leading-relaxed">
              Discover newly deployed Solana contracts mentioned by alpha hunters on X. 
              <span className="text-cyan-400 font-semibold"> Find the next gem before it moons! </span>🚀
            </p>
            {lastUpdate && (
              <div className="flex items-center justify-center gap-2 mt-4 text-xs sm:text-sm text-slate-500">
                <Clock className="w-4 h-4" />
                Last scan: {lastUpdate.toLocaleString()}
              </div>
            )}
            {scanStatus && (
              <div className="flex items-center justify-center gap-2 mt-2 text-xs sm:text-sm text-cyan-400">
                <Radar className="w-4 h-4 animate-spin" />
                {scanStatus}
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <StatCard 
              icon={Search} 
              label="Total Found" 
              value={contracts.length} 
              color="from-cyan-500 to-blue-500" 
            />
            <StatCard 
              icon={Shield} 
              label="Low Risk" 
              value={contracts.filter(c => c.riskScore < 40).length} 
              color="from-emerald-500 to-teal-500" importation
            />
            <StatCard 
              icon={Flame} 
              label="Trending" 
              value={contracts.filter(c => c.tags.includes('TRENDING')).length} 
              color="from-orange-500 to-red-500" 
            />
            <StatCard 
              icon={Zap} 
              label="Fresh" 
              value={contracts.filter(c => c.tags.includes('FRESH') || c.tags.includes('ULTRA_FRESH')).length} 
              color="from-yellow-500 to-orange-500" 
            />
          </div>

          {/* Controls */}
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between mb-8">
            <div className="flex flex-wrap gap-2 sm:gap-3 justify-center lg:justify-start">
              {[
                { key: 'all', label: 'All', icon: Activity, color: 'from-slate-600 to-slate-700' },
                { key: 'low_risk', label: 'Low Risk', icon: Shield, color: 'from-emerald-600 to-teal-600' },
                { key: 'trending', label: 'Trending', icon: TrendingUp, color: 'from-purple-600 to-pink-600' },
                { key: 'fresh', label: 'Fresh', icon: Zap, color: 'from-orange-600 to-yellow-600' }
              ].map(({ key, label, icon: Icon, color }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 backdrop-blur-sm border ${
                    filter === key
                      ? `bg-gradient-to-r ${color} text-white border-white/20 shadow-lg scale-105`
                      : 'bg-slate-800/40 text-slate-300 hover:bg-slate-700/50 border-slate-600/30 hover:border-slate-500/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            
            <button
              onClick={scanForContracts}
              disabled={loading}
              className={`
                bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 
                disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium 
                transition-all duration-300 transform hover:scale-105 disabled:hover:scale-100 
                flex items-center gap-2 shadow-lg shadow-cyan-500/25 backdrop-blur-sm
                ${loading ? 'animate-pulse' : ''}
              `}
            >
              <Radar className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>

          {/* Contract Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
            {loading && contracts.length === 0 ? (
              Array.from({ length: 6 }).map((_, index) => (
                <GlassCard key={index} className="p-6 animate-pulse" hover={false}>
                  <div className="space-y-4">
                    <div className="h-6 bg-slate-700/50 rounded-lg w-3/4"></div>
                    <div className="h-4 bg-slate-700/50 rounded w-full"></div>
                    <div className="h-4 bg-slate-700/50 rounded w-1/2"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-slate-700/50 rounded w-full"></div>
                      <div className="h-3 bg-slate-700/50 rounded w-2/3"></div>
                    </div>
                  </div>
                </GlassCard>
              ))
            ) : filteredContracts.length > 0 ? (
              filteredContracts.map((contract) => (
                <GlassCard key={contract.address} className="p-6 group">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-bold text-white text-lg sm:text-xl bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                          ${contract.symbol}
                        </h3>
                        <RiskBadge score={contract.riskScore} />
                        {contract.verified && (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-sm text-slate-400 font-medium">{contract.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        {Math.floor((Date.now() - contract.deployedAt.getTime()) / (1000 * 60))}m ago
                      </p>
                    </div>
                  </div>

                  {/* Contract Address */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between bg-slate-900/60 backdrop-blur-sm rounded-xl p-3 border border-slate-700/30">
                      <code className="text-xs text-cyan-300 font-mono truncate flex-1 mr-2">
                        {contract.address}
                      </code>
                      <button
                        onClick={() => copyToClipboard(contract.address)}
                        className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded-lg"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 border border-slate-700/20">
                      <p className="text-xs text-slate-400 mb-1">Social</p>
                      <p className="font-bold text-purple-300">{contract.socialScore}</p>
                    </div>
                    <div className="text-center bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 border border-slate-700/20">
                      <p className="text-xs text-slate-400 mb-1">Mentions</p>
                      <p className="font-bold text-blue-300">{contract.mentionedBy.length}</p>
                    </div>
                    <div className="text-center bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 border border-slate-700/20">
                      <p className="text-xs text-slate-400 mb-1">Holders</p>
                      <p className="font-bold text-emerald-300">{contract.holders?.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {contract.tags.map(tag => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed line-clamp-2">
                    {contract.description}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(`https://solscan.io/account/${contract.address}`, '_blank')}
                      className="flex-1 bg-gradient-to-r from-blue-600/20 to-blue-500/20 hover:from-blue-600/30 hover:to-blue-500/30 text-blue-300 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 flex items-center justify-center gap-2 border border-blue-500/20 backdrop-blur-sm"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Solscan
                    </button>
                    <button
                      onClick={() => window.open(contract.dexData?.dexUrl || `https://dexscreener.com/solana/${contract.address}`, '_blank')}
                      className="flex-1 bg-gradient-to-r from-emerald-600/20 to-emerald-500/20 hover:from-emerald-600/30 hover:to-emerald-500/30 text-emerald-300 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 flex items-center justify-center gap-2 border border-emerald-500/20 backdrop-blur-sm"
                    >
                      <BarChart3 className="w-3 h-3" />
                      Chart
                    </button>
                  </div>
                </GlassCard>
              ))
            ) : (
              <div className="col-span-full text-center py-16">
                <div className="relative mb-6">
                  <Search className="w-16 h-16 text-slate-600 mx-auto" />
                  <div className="absolute inset-0 w-16 h-16 bg-slate-600/20 rounded-full blur-xl mx-auto animate-pulse"></div>
                </div>
                <p className="text-slate-400 text-xl mb-2">No contracts found</p>
                <p className="text-slate-500 text-sm">Try scanning again or adjust your filters</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-16 space-y-3">
            <GlassCard className="inline-block px-6 py-4" hover={false}>
              <div className="text-xs text-slate-400 space-y-2">
                <p className="flex items-center gap-2 justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-400 font-medium">This tool is for research purposes only. Always DYOR before investing!</span>
                </p>
                <p className="text-slate-500">
                  Monitoring alpha hunters • Auto-scans every 10 minutes • 
                  <span className="text-red-400 ml-1">High risk tokens may be rugs or scams</span>
                </p>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}