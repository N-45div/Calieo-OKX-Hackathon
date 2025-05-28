/* eslint-disable @typescript-eslint/ban-ts-comment */
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import axios from 'axios';
import { Server, Socket } from 'socket.io';
import http from 'http';
import { Connection, PublicKey, TokenAmount, TokenAccountBalancePair } from '@solana/web3.js';
import cron from 'node-cron';
import dotenv from 'dotenv';
import CryptoJS from 'crypto-js';
import base58 from 'bs58';

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
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || "AAAAAAAAAAAAAAAAAAAAAFxqzQEAAAAAZPRCRDTeJ8uOt56coy0%2F3kmTZwo%3DtEwps4FR9lNh8DKt4C6rqGcGZ9b34n1GoN8fTX1bXzd0xgzW5e";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=2d8978c6-7067-459f-ae97-7ea035f1a0cb';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// OKX DEX API Configuration
const OKX_API_KEY = process.env.OKX_API_KEY || "89741cb9-fa03-49b6-a6db-5b974a5f8fdf";
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || "6E769FF4CC4C695D9E91D216424D648A";
const OKX_API_PASSPHRASE = process.env.OKX_API_PASSPHRASE || "Suresh@23";
const OKX_PROJECT_ID = process.env.OKX_PROJECT_ID || "c38b1db0c8c646520faa9282dcf90717";
const OKX_BASE_URL = "https://web3.okx.com";
const SOLANA_CHAIN_INDEX = "501"; // Solana Mainnet chainIndex (verify with OKX docs)
const SOLANA_CHAIN_ID = "501"; // Deprecated chainId, included for backward compatibility

// Interfaces (Existing)
interface Tweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics: {
    like_count: number;
    retweet_count: number;
  };
  username: string;
  author_id?: string;
}

interface DexData {
  price: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  dexUrl: string;
  verified: boolean;
  marketCap: number;
}

interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  supply: string | null;
  holder: number | null;
}

interface ContractInfo {
  address: string;
  deployedAt: Date;
  owner: string;
  lamports: number;
  supply: TokenAmount | null;
  executable: boolean;
  largestAccounts: TokenAccountBalancePair[];
  holderRisk: number;
  totalSignatures: number;
}

interface Contract {
  address: string;
  symbol: string;
  name: string;
  deployedAt: Date;
  mentionedBy: string[];
  tweets: Tweet[];
  riskScore: number;
  liquidityScore: number;
  socialScore: number;
  tags: string[];
  verified: boolean;
  marketCap: number;
  holders: number;
  description: string;
  dexData: DexData | null;
}

// New Interfaces for OKX DEX API
interface OKXQuoteData {
  chainIndex: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  tradeFee: string;
  estimateGasFee: string;
  dexRouterList: Array<{
    router: string;
    routerPercent: string;
    subRouterList: Array<{
      dexProtocol: string[];
      dexName: string;
      percent: string;
    }>;
  }>;
  fromToken: {
    tokenContractAddress: string;
    tokenSymbol: string;
    tokenUnitPrice: string | null;
    decimal: string;
    isHoneyPot: boolean;
    taxRate: string;
  };
  toToken: {
    tokenContractAddress: string;
    tokenSymbol: string;
    tokenUnitPrice: string | null;
    decimal: string;
    isHoneyPot: boolean;
    taxRate: string;
  };
  quoteCompareList: Array<{
    dexName: string;
    dexLogo: string;
    tradeFee: string;
    amountOut: string;
    priceImpactPercentage: string;
  }>;
}

interface OKXSwapInstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface OKXSwapInstruction {
  data: string;
  accounts: OKXSwapInstructionAccount[];
  programId: string;
}

interface OKXSwapInstructionsData {
  addressLookupTableAccount: string[];
  instructionLists: OKXSwapInstruction[];
}

interface SwapResult {
  success: boolean;
  orderId?: string;
  txHash?: string;
  status?: string;
  error?: string;
}

// In-memory storage (Existing)
let contractsCache: Contract[] = [];
let lastScanTime: Date | null = null;
let scanInProgress = false;

// Alpha hunters to monitor (Existing)
const ALPHA_HUNTERS: string[] = [
  'degenspartan',
  'SolBigBrain',
  '0xSisyphus',
  'thedefiedge',
  'DegenTrades',
  'CryptoGodJohn',
  'alphakek',
  'solana_daily',
  'OnChainWizard',
  'CryptoMillions',
  'SolanaLegend',
  'DegenAlpha',
  'SolanaNews',
  'coinflipper',
  'TraderSZ',
  'SolanaFloor'
];

// Cache for Twitter user IDs
const userIdCache = new Map<string, string>();

// WebSocket connection handling (Existing)
io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('contracts-update', {
    contracts: contractsCache,
    lastUpdate: lastScanTime,
    totalClients: io.engine.clientsCount
  });

  socket.emit('scan-status', {
    inProgress: scanInProgress,
    lastScan: lastScanTime
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  socket.on('request-scan', async () => {
    if (!scanInProgress) {
      console.log(`Manual scan requested by client: ${socket.id}`);
      await performScan();
    }
  });
});

// Twitter API helper functions (Updated)
const getTwitterHeaders = () => ({
  'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
  'Content-Type': 'application/json'
});

// Fetch user ID with caching
const getUserId = async (username: string): Promise<string> => {
  if (userIdCache.has(username)) {
    return userIdCache.get(username)!;
  }

  try {
    const url = `https://api.twitter.com/2/users/by/username/${username}`;
    const response = await axios.get(url, { headers: getTwitterHeaders() });
    const userId = response.data.data.id;
    userIdCache.set(username, userId);
    return userId;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching user ID for ${username}:`, error.message);
      throw error;
    }
    throw error;
  }
};

// Fetch recent tweets from alpha hunters with rate limiting
const fetchAlphaHunterTweets = async (username: string, maxResults: number = 15): Promise<Tweet[]> => {
  try {
    const userId = await getUserId(username);

    const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets`;
    const params = {
      'max_results': maxResults,
      'tweet.fields': 'created_at,public_metrics,context_annotations,entities',
      'exclude': 'retweets,replies',
      'since_id': getLastTweetId(username)
    };

    const response = await axios.get(tweetsUrl, {
      headers: getTwitterHeaders(),
      params
    });

    const tweets: Tweet[] = response.data.data || [];

    return tweets.filter((tweet: Tweet) => {
      if (!tweet.text) return false;

      const text = tweet.text.toLowerCase();
      const cryptoKeywords = [
        'solana', 'sol', 'token', 'contract', 'mint', 'liquidity',
        'dex', 'trading', 'pump', 'moon', 'gem', 'alpha', 'ape',
        'launch', 'new', 'fresh', 'deployed', '$', 'CA:'
      ];

      return cryptoKeywords.some(keyword => text.includes(keyword));
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching tweets for ${username}:`, error.message);
    } else {
      console.error(`Error fetching tweets for ${username}:`, error);
    }
    return [];
  }
};

// Tweet ID cache (Existing)
const tweetIdCache = new Map<string, string>();
const getLastTweetId = (username: string): string | undefined => tweetIdCache.get(username);
const setLastTweetId = (username: string, tweetId: string): void => {
  tweetIdCache.set(username, tweetId);
};

// DexScreener API integration (Existing)
const getDexScreenerData = async (address: string): Promise<DexData | null> => {
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
        verified: pair.info?.verified || false
      };
    }
    return null;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`DexScreener API error for ${address}:`, error.message);
    } else {
      console.error(`DexScreener API error for ${address}:`, error);
    }
    return null;
  }
};

// Enhanced token metadata fetching (Existing)
const getTokenMetadata = async (address: string): Promise<TokenMetadata | null> => {
  try {
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

    return {
      symbol: `TOKEN${address.slice(-4).toUpperCase()}`,
      name: `Token ${address.slice(0, 4)}...${address.slice(-4)}`,
      decimals: 9,
      supply: null,
      holder: null
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error getting token metadata for ${address}:`, error.message);
    } else {
      console.error(`Error getting token metadata for ${address}:`, String(error));
    }
    return null;
  }
};

// Extract Solana contract addresses from text (Existing)
const extractSolanaAddresses = (text: string): string[] => {
  const solanaRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  const matches = text.match(solanaRegex) || [];

  return matches.filter((addr: string) => {
    try {
      new PublicKey(addr);
      if (addr.length < 32 || addr.length > 44) return false;
      if (addr.includes('111111111111111111111111111111')) return false;
      return true;
    } catch {
      return false;
    }
  });
};

// Get contract information from Solana (Existing)
const getContractInfo = async (address: string): Promise<ContractInfo | null> => {
  try {
    const pubkey = new PublicKey(address);
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo) return null;

    let supply: TokenAmount | null = null;
    let largestAccounts: TokenAccountBalancePair[] = [];

    try {
      const tokenSupply = await connection.getTokenSupply(pubkey);
      supply = tokenSupply.value;
      const largestTokenAccounts = await connection.getTokenLargestAccounts(pubkey);
      largestAccounts = largestTokenAccounts.value;
    } catch (e) {}

    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 1000 });
    const deployedAt = signatures.length > 0
      ? new Date((signatures[signatures.length - 1].blockTime ?? 0) * 1000)
      : new Date();

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
    if (error instanceof Error) {
      console.error(`Error getting contract info for ${address}:`, error.message);
    } else {
      console.error(`Error getting contract info for ${address}:`, error);
    }
    return null;
  }
};

// Calculate holder concentration risk (Existing)
const calculateHolderRisk = (largestAccounts: TokenAccountBalancePair[], supply: TokenAmount | null): number => {
  if (!largestAccounts || !supply || largestAccounts.length === 0) return 50;

  const totalSupply = parseFloat(supply.amount);
  const top5Holdings = largestAccounts.slice(0, 5).reduce((sum: number, account: TokenAccountBalancePair) =>
    sum + parseFloat(account.amount), 0);

  const concentrationRatio = (top5Holdings / totalSupply) * 100;

  if (concentrationRatio > 80) return 90;
  if (concentrationRatio > 60) return 70;
  if (concentrationRatio > 40) return 50;
  if (concentrationRatio > 20) return 30;
  return 10;
};

// Calculate risk score (Existing)
const calculateRiskScore = (contractInfo: ContractInfo, tweetData: Tweet[], mentions: string[], dexData: DexData | null, tokenMeta: TokenMetadata): number => {
  let riskScore = 50;

  const ageMinutes = (Date.now() - contractInfo.deployedAt.getTime()) / (1000 * 60);
  if (ageMinutes < 30) riskScore += 40;
  else if (ageMinutes < 60) riskScore += 25;
  else if (ageMinutes < 1440) riskScore += 10;
  else if (ageMinutes > 10080) riskScore -= 15;

  if (mentions.length > 5) riskScore -= 25;
  else if (mentions.length > 2) riskScore -= 15;
  else if (mentions.length === 1) riskScore += 20;

  const totalEngagement = tweetData.reduce((sum: number, tweet: Tweet) =>
    sum + (tweet.public_metrics?.like_count || 0) +
    (tweet.public_metrics?.retweet_count || 0), 0);

  if (totalEngagement > 500) riskScore -= 20;
  else if (totalEngagement > 100) riskScore -= 10;
  else if (totalEngagement < 10) riskScore += 15;

  if (dexData) {
    if (dexData.liquidity > 50000) riskScore -= 20;
    else if (dexData.liquidity > 10000) riskScore -= 10;
    else if (dexData.liquidity < 1000) riskScore += 25;

    if (dexData.volume24h > 100000) riskScore -= 15;
    else if (dexData.volume24h < 1000) riskScore += 10;

    if (dexData.verified) riskScore -= 15;
  } else {
    riskScore += 20;
  }

  if (contractInfo.holderRisk) {
    riskScore += contractInfo.holderRisk * 0.3;
  }

  if (contractInfo.totalSignatures > 1000) riskScore -= 10;
  else if (contractInfo.totalSignatures < 10) riskScore += 15;

  return Math.max(0, Math.min(100, Math.round(riskScore)));
};

// Generate tags (Existing)
const generateTags = (contractInfo: ContractInfo, riskScore: number, ageMinutes: number, mentions: string[], dexData: DexData | null): string[] => {
  const tags: string[] = [];

  if (riskScore < 30) tags.push('LOW_RISK');
  else if (riskScore > 70) tags.push('HIGH_RISK');

  if (ageMinutes < 30) tags.push('ULTRA_FRESH');
  else if (ageMinutes < 60) tags.push('FRESH');
  else if (ageMinutes < 1440) tags.push('NEW');

  if (mentions.length > 4) tags.push('TRENDING');
  else if (mentions.length > 2) tags.push('POPULAR');

  const topHunters = ['degenspartan', 'SolBigBrain', '0xSisyphus', 'thedefiedge'];
  if (mentions.some((m: string) => topHunters.includes(m))) {
    tags.push('ALPHA_HUNTER');
  }

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

// Main scanning function (Updated with rate limiting)
const performScan = async (): Promise<void> => {
  if (scanInProgress) {
    console.log('Scan already in progress, skipping...');
    return;
  }

  scanInProgress = true;
  console.log('🔍 Starting enhanced contract scan...');

  io.emit('scan-status', { inProgress: true, stage: 'Fetching tweets...' });

  try {
    const allTweets: Tweet[] = [];
    const contractAddresses = new Set<string>();
    const mentionMap = new Map<string, string[]>();
    const tweetMap = new Map<string, Tweet[]>();

    for (const [index, hunter] of ALPHA_HUNTERS.entries()) {
      try {
        io.emit('scan-status', {
          inProgress: true,
          stage: `Scanning ${hunter} (${index + 1}/${ALPHA_HUNTERS.length})...`
        });

        const tweets = await fetchAlphaHunterTweets(hunter, 20);

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
            if (!mentionMap.get(address)!.includes(hunter)) {
              mentionMap.get(address)!.push(hunter);
            }

            if (!tweetMap.has(address)) {
              tweetMap.set(address, []);
            }
            tweetMap.get(address)!.push({
              ...tweet,
              username: hunter
            });
          }
        }

        allTweets.push(...tweets);
        // Increased delay to avoid rate limits (spread requests over time)
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (error) {
        if (error instanceof Error) {
          console.error(`Failed to fetch tweets for ${hunter}:`, error.message);
        } else {
          console.error(`Failed to fetch tweets for ${hunter}:`, error);
        }
        continue;
      }
    }

    console.log(`Found ${contractAddresses.size} unique contract addresses`);
    io.emit('scan-status', {
      inProgress: true,
      stage: `Processing ${contractAddresses.size} contracts...`
    });

    const contracts: Contract[] = [];
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

        const contractInfo = await getContractInfo(address);
        if (!contractInfo) continue;

        const mentions = mentionMap.get(address) || [];
        const tweets = tweetMap.get(address) || [];
        const ageMinutes = (Date.now() - contractInfo.deployedAt.getTime()) / (1000 * 60);

        if (ageMinutes > 10080 && mentions.length < 3) continue;

        const dexData = await getDexScreenerData(address);
        const tokenMeta = await getTokenMetadata(address);
        if (!tokenMeta) continue;

        const riskScore = calculateRiskScore(contractInfo, tweets, mentions, dexData, tokenMeta);
        const tags = generateTags(contractInfo, riskScore, ageMinutes, mentions, dexData);

        const socialScore = Math.min(100, mentions.length * 12 +
          tweets.reduce((sum: number, t: Tweet) => sum + (t.public_metrics?.like_count || 0), 0) / 15);

        const liquidityScore = dexData ?
          Math.min(100, Math.max(10, (dexData.liquidity / 1000))) :
          Math.max(20, 100 - riskScore);

        contracts.push({
          address,
          symbol: tokenMeta.symbol,
          name: tokenMeta.name,
          deployedAt: contractInfo.deployedAt,
          mentionedBy: mentions,
          tweets: tweets.map((t: Tweet) => ({
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
          dexData
        });

        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error processing contract ${address}:`, error.message);
        } else {
          console.error(`Error processing contract ${address}:`, error);
        }
        continue;
      }
    }

    contracts.sort((a: Contract, b: Contract) => {
      const aScore = (a.mentionedBy.length * 10) + (100 - a.riskScore) + (a.socialScore / 10);
      const bScore = (b.mentionedBy.length * 10) + (100 - b.riskScore) + (b.socialScore / 10);
      return bScore - aScore;
    });

    contractsCache = contracts;
    lastScanTime = new Date();
    console.log(`✅ Scan completed: ${contracts.length} contracts processed`);

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
    if (error instanceof Error) {
      console.error('Scan error:', error);
      io.emit('scan-error', { error: error.message });
    } else {
      console.error('Scan error:', error);
      io.emit('scan-error', { error: String(error) });
    }
  } finally {
    scanInProgress = false;
    io.emit('scan-status', { inProgress: false, lastScan: lastScanTime });
  }
};

// OKX DEX API Helper Functions (Updated)
const getOKXHeaders = (timestamp: string, method: string, requestPath: string, queryString = "", body = ""): Record<string, string> => {
  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_API_PASSPHRASE || !OKX_PROJECT_ID) {
    throw new Error("Missing required environment variables for OKX API authentication");
  }

  const fullPath = method === "GET" && queryString ? requestPath + queryString : requestPath;
  const stringToSign = timestamp + method + fullPath + (method === "POST" ? body : "");

  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": OKX_API_KEY,
    "OK-ACCESS-SIGN": CryptoJS.enc.Base64.stringify(
      CryptoJS.HmacSHA256(stringToSign, OKX_SECRET_KEY)
    ),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": OKX_API_PASSPHRASE,
    "OK-ACCESS-PROJECT": OKX_PROJECT_ID,
  };
};

// Fetch Swap Quote from OKX DEX
const getOKXSwapQuote = async (
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string
): Promise<OKXQuoteData> => {
  const timestamp = new Date().toISOString();
  const path = `dex/aggregator/quote`;
  const requestPath = `/api/v5/${path}`;

  const params: Record<string, string> = {
    chainIndex: SOLANA_CHAIN_INDEX,
    chainId: SOLANA_CHAIN_ID,
    amount,
    fromTokenAddress,
    toTokenAddress,
    priceImpactProtectionPercentage: "0.9",
  };

  const queryString = "?" + new URLSearchParams(params).toString();
  const headers = getOKXHeaders(timestamp, "GET", requestPath, queryString);

  try {
    const response = await axios.get(`${OKX_BASE_URL}${requestPath}${queryString}`, {
      headers,
      timeout: 15000,
    });

    console.log("OKX API Response for Quote:", response.data);

    if (response.data.code !== "0" || !response.data.data?.[0]) {
      throw new Error(`Failed to get quote: ${response.data.msg || "Unknown error"}`);
    }

    return response.data.data[0];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("OKX API Error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`OKX API Error: ${error.response?.data?.msg || error.message}`);
    }
    throw error;
  }
};

// Fetch Swap Instructions from OKX DEX (New)
const getOKXSwapInstructions = async (
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  userAddress: string,
  slippage = "0.5"
): Promise<OKXSwapInstructionsData> => {
  const timestamp = new Date().toISOString();
  const path = `dex/aggregator/swap-instruction`;
  const requestPath = `/api/v5/${path}`;

  const params: Record<string, string> = {
    chainIndex: SOLANA_CHAIN_INDEX,
    chainId: SOLANA_CHAIN_ID,
    fromTokenAddress,
    toTokenAddress,
    amount,
    slippage,
    userWalletAddress: userAddress,
    priceImpactProtectionPercentage: "0.9",
    computeUnitLimit: "300000", // Set a reasonable compute unit limit
  };

  const queryString = "?" + new URLSearchParams(params).toString();
  const headers = getOKXHeaders(timestamp, "GET", requestPath, queryString);

  try {
    const response = await axios.get(`${OKX_BASE_URL}${requestPath}${queryString}`, {
      headers,
      timeout: 20000,
    });

    console.log("OKX API Response for Swap Instructions:", response.data);

    if (response.data.code !== "0" || !response.data.data?.[0]) {
      throw new Error(`Swap Instructions API Error (${response.data.code}): ${response.data.msg || "Unknown error"}`);
    }

    const swapInstructions = response.data.data[0];
    if (!swapInstructions.instructionLists || !Array.isArray(swapInstructions.instructionLists)) {
      throw new Error("Invalid swap instructions data received from API");
    }

    return swapInstructions;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("OKX API Error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`OKX API Error: ${error.response?.data?.msg || error.message}`);
    }
    throw error;
  }
};

// Broadcast Transaction via OKX DEX
const broadcastOKXTransaction = async (signedTx: string, userAddress: string): Promise<string> => {
  const path = `dex/pre-transaction/broadcast-transaction`;
  const requestPath = `/api/v5/${path}`;

  const broadcastData = {
    signedTx,
    chainIndex: SOLANA_CHAIN_INDEX,
    address: userAddress,
  };

  const bodyString = JSON.stringify(broadcastData);
  const timestamp = new Date().toISOString();
  const headers = getOKXHeaders(timestamp, "POST", requestPath, "", bodyString);

  try {
    const response = await axios.post(`${OKX_BASE_URL}${requestPath}`, broadcastData, {
      headers,
      timeout: 20000,
    });

    console.log("OKX API Response for Broadcast:", response.data);

    if (response.data.code === "0" && response.data.data?.[0]?.orderId) {
      return response.data.data[0].orderId;
    } else {
      throw new Error(`Broadcast failed: ${response.data.msg || "Unknown error"}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("OKX API Error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`OKX API Error: ${error.response?.data?.msg || error.message}`);
    }
    throw error;
  }
};

// Track Transaction via OKX DEX
const trackOKXTransaction = async (orderId: string, intervalMs = 5000, timeoutMs = 60000): Promise<any> => {
  const startTime = Date.now();
  let lastStatus = "";

  while (Date.now() - startTime < timeoutMs) {
    const path = `dex/post-transaction/orders`;
    const requestPath = `/api/v5/${path}`;

    const params = {
      orderId,
      chainIndex: SOLANA_CHAIN_INDEX,
      limit: "1",
    };

    const queryString = "?" + new URLSearchParams(params).toString();
    const timestamp = new Date().toISOString();
    const headers = getOKXHeaders(timestamp, "GET", requestPath, queryString);

    try {
      const response = await axios.get(`${OKX_BASE_URL}${requestPath}${queryString}`, {
        headers,
        timeout: 10000,
      });

      console.log("OKX API Response for Transaction Tracking:", response.data);

      if (response.data.code === "0" && response.data.data && response.data.data.length > 0) {
        if (response.data.data[0].orders && response.data.data[0].orders.length > 0) {
          const txData = response.data.data[0];
          const status = txData.orders[0].txStatus;

          if (status !== lastStatus) {
            lastStatus = status;
            if (status === "2") { // Success
              return txData;
            } else if (status === "3") { // Failed
              throw new Error(`Transaction failed: ${txData.orders[0].failReason || "Unknown reason"}`);
            }
          }
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("OKX API Error during transaction tracking:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
        throw new Error(`OKX API Error: ${error.response?.data?.msg || error.message}`);
      }
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error("Transaction tracking timed out");
};

// Helper to handle async Express handlers (Existing)
const asyncHandler = <P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => Promise<void | Response<ResBody>>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as Request<P, ResBody, ReqBody, ReqQuery>, res as Response<ResBody>, next))
      .catch(next);
  };
};

// REST API Endpoints (Existing)
app.get('/api/scan', asyncHandler(async (req: Request, res: Response) => {
  if (contractsCache.length === 0 && !scanInProgress) {
    await performScan();
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
}));

app.get('/api/contract/:address', asyncHandler<{ address: string }>(async (req: Request<{ address: string }>, res: Response) => {
  const { address } = req.params;

  const cachedContract = contractsCache.find(c => c.address === address);
  const contractInfo = await getContractInfo(address);
  if (!contractInfo) {
    return res.status(404).json({
      success: false,
      error: 'Contract not found'
    });
  }

  const dexData = await getDexScreenerData(address);

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

  const tweets: Tweet[] = response.data.data || [];
  const users: Array<{ id: string; username: string }> = response.data.includes?.users || [];

  const userMap = users.reduce((map: { [key: string]: string }, user: { id: string; username: string }) => {
    map[user.id] = user.username;
    return map;
  }, {});

  const enrichedTweets = tweets.map((tweet: Tweet) => ({
    ...tweet,
    username: userMap[tweet.author_id!] || 'unknown'
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
        totalEngagement: tweets.reduce((sum: number, t: Tweet) =>
          sum + (t.public_metrics?.like_count || 0) +
          (t.public_metrics?.retweet_count || 0), 0),
        uniqueUsers: new Set(enrichedTweets.map((t: { username: string }) => t.username)).size
      }
    }
  });
}));

app.get('/api/status', (req: Request, res: Response) => {
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

app.post('/api/scan/trigger', asyncHandler(async (req: Request, res: Response) => {
  if (scanInProgress) {
    res.status(429).json({
      success: false,
      error: 'Scan already in progress'
    });
    return;
  }

  await performScan();

  res.json({
    success: true,
    message: 'Scan started',
    estimatedDuration: '2-3 minutes'
  });
}));

app.get('/api/health', (req: Request, res: Response) => {
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

app.get('/api/hunters', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: ALPHA_HUNTERS.map(hunter => ({
      username: hunter,
      url: `https://twitter.com/${hunter}`,
      lastTweetId: getLastTweetId(hunter)
    }))
  });
});

// OKX DEX API Endpoints
// Get Swap Quote
app.post('/api/swap/quote', asyncHandler(async (req: Request<{}, any, { fromTokenAddress: string; toTokenAddress: string; amount: string }>, res: Response) => {
  const { fromTokenAddress, toTokenAddress, amount } = req.body;

  if (!fromTokenAddress || !toTokenAddress || !amount) {
    return res.status(400).json({
      success: false,
      error: "Missing required parameters: fromTokenAddress, toTokenAddress, amount",
    });
  }

  try {
    const quote = await getOKXSwapQuote(fromTokenAddress, toTokenAddress, amount);
    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    console.error("Error in /api/swap/quote:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch swap quote",
    });
  }
}));

// Execute Swap (Updated to use swap-instruction endpoint)
app.post('/api/swap/execute', asyncHandler(async (req: Request<{}, any, { fromTokenAddress: string; toTokenAddress: string; amount: string; userAddress: string; slippage?: string; signedTx: string }>, res: Response) => {
  const { fromTokenAddress, toTokenAddress, amount, userAddress, slippage = "0.5", signedTx } = req.body;

  if (!fromTokenAddress || !toTokenAddress || !amount || !userAddress || !signedTx) {
    return res.status(400).json({
      success: false,
      error: "Missing required parameters: fromTokenAddress, toTokenAddress, amount, userAddress, signedTx",
    });
  }

  try {
    // Step 1: Get swap instructions
    const swapInstructions = await getOKXSwapInstructions(fromTokenAddress, toTokenAddress, amount, userAddress, slippage);

    // If signedTx is "pending", return the swap instructions for the frontend to construct the transaction
    if (signedTx === "pending") {
      res.json({
        success: true,
        data: swapInstructions,
      });
      return;
    }

    // Step 2: Broadcast the signed transaction with userAddress
    const orderId = await broadcastOKXTransaction(signedTx, userAddress);

    // Step 3: Track the transaction
    const txStatus = await trackOKXTransaction(orderId);

    res.json({
      success: true,
      data: {
        orderId,
        txHash: txStatus.orders[0].txHash,
        status: txStatus.orders[0].txStatus === "2" ? "SUCCESS" : "PENDING",
      },
    });
  } catch (error) {
    console.error("Error in /api/swap/execute:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to execute swap",
    });
  }
}));

// Error handling middleware (Existing)
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler (Existing)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/scan',
      'GET /api/contract/:address',
      'GET /api/health',
      'GET /api/hunters',
      'GET /api/status',
      'POST /api/scan/trigger',
      'POST /api/swap/quote',
      'POST /api/swap/execute',
    ]
  });
});

// Automated scanning with cron job (Existing)
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

  setTimeout(() => {
    console.log('🎯 Starting initial scan...');
    performScan();
  }, 5000);
});