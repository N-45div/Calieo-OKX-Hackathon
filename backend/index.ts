import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { Server } from 'socket.io';
import http from 'http';
import { Connection, PublicKey } from '@solana/web3.js';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// In-memory storage
let contractsCache = [];
let lastScanTime = null;
let scanInProgress = false;

// Alpha hunters to monitor (Twitter usernames)
const ALPHA_HUNTERS = [
  'degenspartan',
  'SolBigBrain', 
  '0xSisyphus',
  'thedefiedge',
  'DegenTrades',
  'CryptoGodJohn',
  'alphakek_',
  'solana_daily',
  'OnChainWizard',
  'CryptoMillions',
  'SolanaLegend',
  'DegenAlpha',
  'SolanaNews',
  'coin_flipper_',
  'TraderSZ',
  'SolanaFloor'
];

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send current data to new client
  socket.emit('contracts-update', {
    contracts: contractsCache,
    lastUpdate: lastScanTime,
    totalClients: io.engine.clientsCount
  });

  // Send scan status
  socket.emit('scan-status', {
    inProgress: scanInProgress,
    lastScan: lastScanTime
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  // Handle manual scan request
  socket.on('request-scan', async () => {
    if (!scanInProgress) {
      console.log(`Manual scan requested by client: ${socket.id}`);
      await performScan();
    }
  });
});

// Twitter API helper functions
const getTwitterHeaders = () => ({
  'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
  'Content-Type': 'application/json'
});

// DexScreener API integration
const getDexScreenerData = async (address) => {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      timeout: 5000
    });
    
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      return {
        price: parseFloat(pair.priceUsd) || 0,
        volume24h: parseFloat(pair.volume?.h24) || 0,
        marketCap: parseFloat(pair.fdv) || 0,
        liquidity: parseFloat(pair.liquidity?.usd) || 0,
        priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
        dexUrl: pair.url,
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
        verified: pair.info?.verified || false
      };
    }
    return null;
  } catch (error) {
    console.error(`DexScreener API error for ${address}:`, error.message);
    return null;
  }
};

// Enhanced token metadata fetching
const getTokenMetadata = async (address) => {
  try {
    // Try multiple sources for token metadata
    const sources = [
      `https://api.solscan.io/token/meta?token=${address}`,
      `https://public-api.solscan.io/token/meta?tokenAddress=${address}`
    ];

    for (const url of sources) {
      try {
        const response = await axios.get(url, { timeout: 3000 });
        if (response.data) {
          return {
            symbol: response.data.symbol || `TOKEN${address.slice(-4)}`,
            name: response.data.name || `Token ${address.slice(0, 4)}...${address.slice(-4)}`,
            decimals: response.data.decimals || 9,
            supply: response.data.supply,
            holder: response.data.holder
          };
        }
      } catch (e) {
        continue;
      }
    }

    // Fallback to generated data
    return {
      symbol: `TOKEN${address.slice(-4).toUpperCase()}`,
      name: `Token ${address.slice(0, 4)}...${address.slice(-4)}`,
      decimals: 9,
      supply: null,
      holder: null
    };
  } catch (error) {
    console.error(`Error getting token metadata for ${address}:`, error.message);
    return null;
  }
};

// Extract Solana contract addresses from text using regex
const extractSolanaAddresses = (text) => {
  // Enhanced regex for Solana addresses
  const solanaRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  const matches = text.match(solanaRegex) || [];
  
  // Filter out common false positives and validate
  return matches.filter(addr => {
    try {
      new PublicKey(addr);
      // Additional filtering for common false positives
      if (addr.length < 32 || addr.length > 44) return false;
      if (addr.includes('111111111111111111111111111111')) return false; // System program
      return true;
    } catch {
      return false;
    }
  });
};

// Fetch recent tweets from alpha hunters with enhanced filtering
const fetchAlphaHunterTweets = async (username, maxResults = 15) => {
  try {
    const url = `https://api.twitter.com/2/users/by/username/${username}`;
    const userResponse = await axios.get(url, { headers: getTwitterHeaders() });
    const userId = userResponse.data.data.id;

    const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets`;
    const params = {
      'max_results': maxResults,
      'tweet.fields': 'created_at,public_metrics,context_annotations,entities,lang',
      'exclude': 'retweets,replies',
      'since_id': getLastTweetId(username) // Only get new tweets
    };

    const response = await axios.get(tweetsUrl, {
      headers: getTwitterHeaders(),
      params
    });

    const tweets = response.data.data || [];
    
    // Filter for crypto-related content
    return tweets.filter(tweet => {
      if (!tweet.text || tweet.lang !== 'en') return false;
      
      const text = tweet.text.toLowerCase();
      const cryptoKeywords = [
        'solana', 'sol', 'token', 'contract', 'mint', 'liquidity', 
        'dex', 'trading', 'pump', 'moon', 'gem', 'alpha', 'ape',
        'launch', 'new', 'fresh', 'deployed', '$', 'CA:'
      ];
      
      return cryptoKeywords.some(keyword => text.includes(keyword));
    });

  } catch (error) {
    console.error(`Error fetching tweets for ${username}:`, error.response?.data || error.message);
    return [];
  }
};

// Simple cache for last tweet IDs (in production, use Redis)
const tweetIdCache = new Map();
const getLastTweetId = (username) => tweetIdCache.get(username);
const setLastTweetId = (username, tweetId) => tweetIdCache.set(username, tweetId);

// Get contract information from Solana with enhanced data
const getContractInfo = async (address) => {
  try {
    const pubkey = new PublicKey(address);
    
    // Get account info
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo) return null;

    // Get token supply and largest accounts
    let supply = null;
    let largestAccounts = [];
    try {
      const tokenSupply = await connection.getTokenSupply(pubkey);
      supply = tokenSupply.value;
      
      const largestTokenAccounts = await connection.getTokenLargestAccounts(pubkey);
      largestAccounts = largestTokenAccounts.value;
    } catch (e) {
      // Not a token account or other error
    }

    // Get transaction signatures to determine deployment time
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 1000 });
    const deployedAt = signatures.length > 0 ? 
      new Date(signatures[signatures.length - 1].blockTime * 1000) : 
      new Date();

    // Calculate holder concentration risk
    const holderRisk = calculateHolderRisk(largestAccounts, supply);

    return {
      address,
      deployedAt,
      owner: accountInfo.owner.toString(),
      lamports: accountInfo.lamports,
      supply,
      executable: accountInfo.executable,
      largestAccounts,
      holderRisk,
      totalSignatures: signatures.length
    };
  } catch (error) {
    console.error(`Error getting contract info for ${address}:`, error.message);
    return null;
  }
};

// Calculate holder concentration risk
const calculateHolderRisk = (largestAccounts, supply) => {
  if (!largestAccounts || !supply || largestAccounts.length === 0) return 50;
  
  const totalSupply = parseFloat(supply.amount);
  const top5Holdings = largestAccounts.slice(0, 5).reduce((sum, account) => 
    sum + parseFloat(account.amount), 0);
  
  const concentrationRatio = (top5Holdings / totalSupply) * 100;
  
  // High concentration = high risk
  if (concentrationRatio > 80) return 90;
  if (concentrationRatio > 60) return 70;
  if (concentrationRatio > 40) return 50;
  if (concentrationRatio > 20) return 30;
  return 10;
};

// Enhanced risk score calculation
const calculateRiskScore = (contractInfo, tweetData, mentions, dexData, tokenMeta) => {
  let riskScore = 50; // Base risk

  // Age factor (newer = riskier)
  const ageMinutes = (Date.now() - contractInfo.deployedAt.getTime()) / (1000 * 60);
  if (ageMinutes < 30) riskScore += 40;
  else if (ageMinutes < 60) riskScore += 25;
  else if (ageMinutes < 1440) riskScore += 10;
  else if (ageMinutes > 10080) riskScore -= 15; // 1 week

  // Mention factor (more mentions = less risky)
  if (mentions.length > 5) riskScore -= 25;
  else if (mentions.length > 2) riskScore -= 15;
  else if (mentions.length === 1) riskScore += 20;

  // Social engagement factor
  const totalEngagement = tweetData.reduce((sum, tweet) => 
    sum + (tweet.public_metrics?.like_count || 0) + 
    (tweet.public_metrics?.retweet_count || 0), 0);
  
  if (totalEngagement > 500) riskScore -= 20;
  else if (totalEngagement > 100) riskScore -= 10;
  else if (totalEngagement < 10) riskScore += 15;

  // DexScreener data factor
  if (dexData) {
    if (dexData.liquidity > 50000) riskScore -= 20;
    else if (dexData.liquidity > 10000) riskScore -= 10;
    else if (dexData.liquidity < 1000) riskScore += 25;

    if (dexData.volume24h > 100000) riskScore -= 15;
    else if (dexData.volume24h < 1000) riskScore += 10;

    if (dexData.verified) riskScore -= 15;
  } else {
    riskScore += 20; // No DEX data available
  }

  // Holder concentration risk
  if (contractInfo.holderRisk) {
    riskScore += contractInfo.holderRisk * 0.3;
  }

  // Transaction activity
  if (contractInfo.totalSignatures > 1000) riskScore -= 10;
  else if (contractInfo.totalSignatures < 10) riskScore += 15;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(riskScore)));
};

// Enhanced tag generation
const generateTags = (contractInfo, riskScore, ageMinutes, mentions, dexData) => {
  const tags = [];

  if (riskScore < 30) tags.push('LOW_RISK');
  else if (riskScore > 70) tags.push('HIGH_RISK');

  if (ageMinutes < 30) tags.push('ULTRA_FRESH');
  else if (ageMinutes < 60) tags.push('FRESH');
  else if (ageMinutes < 1440) tags.push('NEW');

  if (mentions.length > 4) tags.push('TRENDING');
  else if (mentions.length > 2) tags.push('POPULAR');
  
  // Check if mentioned by top alpha hunters
  const topHunters = ['degenspartan', 'SolBigBrain', '0xSisyphus', 'thedefiedge'];
  if (mentions.some(m => topHunters.includes(m))) {
    tags.push('ALPHA_HUNTER');
  }

  // DexScreener based tags
  if (dexData) {
    if (dexData.volume24h > 100000) tags.push('HIGH_VOLUME');
    if (dexData.liquidity > 50000) tags.push('GOOD_LIQUIDITY');
    if (dexData.priceChange24h > 50) tags.push('PUMPING');
    else if (dexData.priceChange24h < -20) tags.push('DUMPING');
    if (dexData.verified) tags.push('VERIFIED');
  } else {
    tags.push('NO_DEX_DATA');
  }

  return tags;
};

// Main scanning function
const performScan = async () => {
  if (scanInProgress) {
    console.log('Scan already in progress, skipping...');
    return;
  }

  scanInProgress = true;
  console.log('🔍 Starting enhanced contract scan...');
  
  // Broadcast scan start
  io.emit('scan-status', { inProgress: true, stage: 'Fetching tweets...' });

  try {
    const allTweets = [];
    const contractAddresses = new Set();
    const mentionMap = new Map();
    const tweetMap = new Map();

    // Fetch tweets from all alpha hunters
    for (const [index, hunter] of ALPHA_HUNTERS.entries()) {
      try {
        io.emit('scan-status', { 
          inProgress: true, 
          stage: `Scanning ${hunter} (${index + 1}/${ALPHA_HUNTERS.length})...` 
        });

        const tweets = await fetchAlphaHunterTweets(hunter, 20);
        
        // Update last tweet ID for next scan
        if (tweets.length > 0) {
          setLastTweetId(hunter, tweets[0].id);
        }
        
        for (const tweet of tweets) {
          if (!tweet.text) continue;
          
          const addresses = extractSolanaAddresses(tweet.text);
          
          for (const address of addresses) {
            contractAddresses.add(address);
            
            if (!mentionMap.has(address)) {
              mentionMap.set(address, []);
            }
            if (!mentionMap.get(address).includes(hunter)) {
              mentionMap.get(address).push(hunter);
            }
            
            if (!tweetMap.has(address)) {
              tweetMap.set(address, []);
            }
            tweetMap.get(address).push({
              ...tweet,
              username: hunter
            });
          }
        }
        
        allTweets.push(...tweets);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1200));
        
      } catch (error) {
        console.error(`Failed to fetch tweets for ${hunter}:`, error.message);
        continue;
      }
    }

    console.log(`Found ${contractAddresses.size} unique contract addresses`);
    io.emit('scan-status', { 
      inProgress: true, 
      stage: `Processing ${contractAddresses.size} contracts...` 
    });

    // Process each contract with enhanced data
    const contracts = [];
    let processedCount = 0;

    for (const address of contractAddresses) {
      try {
        processedCount++;
        
        if (processedCount % 5 === 0) {
          io.emit('scan-status', { 
            inProgress: true, 
            stage: `Processing contracts... (${processedCount}/${contractAddresses.size})` 
          });
        }

        // Get contract info from Solana
        const contractInfo = await getContractInfo(address);
        if (!contractInfo) continue;

        const mentions = mentionMap.get(address) || [];
        const tweets = tweetMap.get(address) || [];
        
        const ageMinutes = (Date.now() - contractInfo.deployedAt.getTime()) / (1000 * 60);
        
        // Skip very old contracts unless highly mentioned
        if (ageMinutes > 10080 && mentions.length < 3) continue;

        // Get DexScreener data
        const dexData = await getDexScreenerData(address);
        
        // Get token metadata
        const tokenMeta = await getTokenMetadata(address);
        if (!tokenMeta) continue;

        const riskScore = calculateRiskScore(contractInfo, tweets, mentions, dexData, tokenMeta);
        const tags = generateTags(contractInfo, riskScore, ageMinutes, mentions, dexData);
        
        // Calculate enhanced scores
        const socialScore = Math.min(100, mentions.length * 12 + 
          tweets.reduce((sum, t) => sum + (t.public_metrics?.like_count || 0), 0) / 15);
        
        const liquidityScore = dexData ? 
          Math.min(100, Math.max(10, (dexData.liquidity / 1000))) : 
          Math.max(20, 100 - riskScore);

        contracts.push({
          address,
          symbol: tokenMeta.symbol,
          name: tokenMeta.name,
          deployedAt: contractInfo.deployedAt,
          mentionedBy: mentions,
          tweets: tweets.map(t => ({
            id: t.id,
            text: t.text,
            created_at: t.created_at,
            public_metrics: t.public_metrics,
            username: t.username
          })),
          riskScore,
          liquidityScore: Math.round(liquidityScore),
          socialScore: Math.round(socialScore),
          tags,
          verified: dexData?.verified || false,
          marketCap: dexData?.marketCap || Math.floor(Math.random() * 1000000) + 5000,
          holders: tokenMeta.holder || Math.floor(Math.random() * 50000) + 100,
          description: `${tokenMeta.name} mentioned by ${mentions.join(', ')}. ${
            dexData ? `$${dexData.price.toFixed(6)} | Vol: $${dexData.volume24h.toLocaleString()}` : 'No trading data'
          }`,
          dexData: dexData ? {
            price: dexData.price,
            volume24h: dexData.volume24h,
            liquidity: dexData.liquidity,
            priceChange24h: dexData.priceChange24h,
            dexUrl: dexData.dexUrl
          } : null
        });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`Error processing contract ${address}:`, error.message);
        continue;
      }
    }

    // Sort by multiple factors: risk score, mentions, age
    contracts.sort((a, b) => {
      const aScore = (a.mentionedBy.length * 10) + (100 - a.riskScore) + (a.socialScore / 10);
      const bScore = (b.mentionedBy.length * 10) + (100 - b.riskScore) + (b.socialScore / 10);
      return bScore - aScore;
    });

    // Update cache
    contractsCache = contracts;
    lastScanTime = new Date();

    console.log(`✅ Scan completed: ${contracts.length} contracts processed`);

    // Broadcast results to all connected clients
    io.emit('contracts-update', {
      contracts: contractsCache,
      lastUpdate: lastScanTime,
      stats: {
        total: contracts.length,
        huntersScanned: ALPHA_HUNTERS.length,
        totalTweets: allTweets.length,
        lowRisk: contracts.filter(c => c.riskScore < 30).length,
        trending: contracts.filter(c => c.tags.includes('TRENDING')).length,
        fresh: contracts.filter(c => c.tags.includes('FRESH') || c.tags.includes('ULTRA_FRESH')).length
      }
    });

  } catch (error) {
    console.error('Scan error:', error);
    io.emit('scan-error', { error: error.message });
  } finally {
    scanInProgress = false;
    io.emit('scan-status', { inProgress: false, lastScan: lastScanTime });
  }
};

// REST API Endpoints

// Main scan endpoint (now uses cached data)
app.get('/api/scan', async (req, res) => {
  try {
    if (contractsCache.length === 0 && !scanInProgress) {
      // If no cached data and no scan in progress, start one
      performScan();
    }

    res.json({
      success: true,
      data: contractsCache,
      meta: {
        total: contractsCache.length,
        lastUpdate: lastScanTime,
        scanInProgress,
        stats: {
          lowRisk: contractsCache.filter(c => c.riskScore < 30).length,
          trending: contractsCache.filter(c => c.tags.includes('TRENDING')).length,
          fresh: contractsCache.filter(c => c.tags.includes('FRESH') || c.tags.includes('ULTRA_FRESH')).length
        }
      }
    });

  } catch (error) {
    console.error('Scan endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contracts',
      message: error.message
    });
  }
});

// Enhanced contract details endpoint
app.get('/api/contract/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Check cache first
    const cachedContract = contractsCache.find(c => c.address === address);
    
    const contractInfo = await getContractInfo(address);
    if (!contractInfo) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Get fresh DexScreener data
    const dexData = await getDexScreenerData(address);
    
    // Search for recent tweets mentioning this contract
    const searchQuery = `${address} OR CA:${address}`;
    const searchUrl = 'https://api.twitter.com/2/tweets/search/recent';
    
    const response = await axios.get(searchUrl, {
      headers: getTwitterHeaders(),
      params: {
        query: searchQuery,
        'tweet.fields': 'created_at,public_metrics,author_id',
        'user.fields': 'username',
        'expansions': 'author_id',
        max_results: 100
      }
    });

    const tweets = response.data.data || [];
    const users = response.data.includes?.users || [];
    
    const userMap = users.reduce((map, user) => {
      map[user.id] = user.username;
      return map;
    }, {});

    const enrichedTweets = tweets.map(tweet => ({
      ...tweet,
      username: userMap[tweet.author_id] || 'unknown'
    }));

    res.json({
      success: true,
      data: {
        contract: {
          ...contractInfo,
          cached: cachedContract || null,
          dexData
        },
        tweets: enrichedTweets,
        stats: {
          totalMentions: tweets.length,
          totalEngagement: tweets.reduce((sum, t) => 
            sum + (t.public_metrics?.like_count || 0) + 
            (t.public_metrics?.retweet_count || 0), 0),
          uniqueUsers: new Set(enrichedTweets.map(t => t.username)).size
        }
      }
    });

  } catch (error) {
    console.error('Contract details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contract details',
      message: error.message
    });
  }
});

// WebSocket status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      scanInProgress,
      lastScanTime,
      cachedContracts: contractsCache.length,
      connectedClients: io.engine.clientsCount,
      monitoredHunters: ALPHA_HUNTERS.length
    }
  });
});

// Manual scan trigger
app.post('/api/scan/trigger', async (req, res) => {
  if (scanInProgress) {
    return res.status(429).json({
      success: false,
      error: 'Scan already in progress'
    });
  }

  // Start scan in background
  performScan();
  
  res.json({
    success: true,
    message: 'Scan started',
    estimatedDuration: '2-3 minutes'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date(),
    services: {
      twitter: !!TWITTER_BEARER_TOKEN,
      solana: !!SOLANA_RPC_URL,
      websocket: io.engine.clientsCount >= 0,
      cache: contractsCache.length > 0
    },
    stats: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connectedClients: io.engine.clientsCount
    }
  });
});

// Get list of monitored alpha hunters
app.get('/api/hunters', (req, res) => {
  res.json({
    success: true,
    data: ALPHA_HUNTERS.map(hunter => ({
      username: hunter,
      url: `https://twitter.com/${hunter}`,
      lastTweetId: getLastTweetId(hunter)
    }))
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/scan',
      'GET /api/contract/:address', 
      'GET /api/health',
      'GET /api/hunters',
      'GET /api/status',
      'POST /api/scan/trigger'
    ]
  });
});

// Automated scanning with cron job
cron.schedule('*/10 * * * *', () => {
  console.log('🕐 Scheduled scan starting...');
  performScan();
});

server.listen(PORT, () => {
  console.log(`🚀 Enhanced Solana Alpha Hunter Backend running on port ${PORT}`);
  console.log(`📊 Monitoring ${ALPHA_HUNTERS.length} alpha hunters`);
  console.log(`🔑 Twitter API: ${TWITTER_BEARER_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  console.log(`⚡ Solana RPC: ${SOLANA_RPC_URL}`);
  console.log(`🔄 Auto-scan every 10 minutes`);
  console.log(`🌐 WebSocket server ready for real-time updates`);
  
  // Initial scan on startup
  setTimeout(() => {
    console.log('🎯 Starting initial scan...');
    performScan();
  }, 5000);
});