import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

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
  'SolanaNews'
];

// Twitter API helper functions
const getTwitterHeaders = () => ({
  'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
  'Content-Type': 'application/json'
});

// Extract Solana contract addresses from text using regex
const extractSolanaAddresses = (text) => {
  // Solana addresses are base58 encoded, typically 32-44 characters
  const solanaRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  const matches = text.match(solanaRegex) || [];
  
  // Filter out common false positives and validate
  return matches.filter(addr => {
    try {
      new PublicKey(addr);
      return true;
    } catch {
      return false;
    }
  });
};

// Fetch recent tweets from alpha hunters
const fetchAlphaHunterTweets = async (username, maxResults = 10) => {
  try {
    const url = `https://api.twitter.com/2/users/by/username/${username}`;
    const userResponse = await axios.get(url, { headers: getTwitterHeaders() });
    const userId = userResponse.data.data.id;

    const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets`;
    const params = {
      'max_results': maxResults,
      'tweet.fields': 'created_at,public_metrics,context_annotations,entities',
      'exclude': 'retweets,replies'
    };

    const response = await axios.get(tweetsUrl, {
      headers: getTwitterHeaders(),
      params
    });

    return response.data.data || [];
  } catch (error) {
    console.error(`Error fetching tweets for ${username}:`, error.response?.data || error.message);
    return [];
  }
};

// Get contract information from Solana
const getContractInfo = async (address) => {
  try {
    const pubkey = new PublicKey(address);
    
    // Get account info
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo) return null;

    // Get token supply if it's a token
    let supply = null;
    try {
      const tokenSupply = await connection.getTokenSupply(pubkey);
      supply = tokenSupply.value;
    } catch (e) {
      // Not a token account
    }

    // Get transaction signatures to determine deployment time
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 1000 });
    const deployedAt = signatures.length > 0 ? 
      new Date(signatures[signatures.length - 1].blockTime * 1000) : 
      new Date();

    return {
      address,
      deployedAt,
      owner: accountInfo.owner.toString(),
      lamports: accountInfo.lamports,
      supply,
      executable: accountInfo.executable
    };
  } catch (error) {
    console.error(`Error getting contract info for ${address}:`, error.message);
    return null;
  }
};

// Calculate risk score based on various factors
const calculateRiskScore = (contractInfo, tweetData, mentions) => {
  let riskScore = 50; // Base risk

  // Age factor (newer = riskier)
  const ageMinutes = (Date.now() - contractInfo.deployedAt.getTime()) / (1000 * 60);
  if (ageMinutes < 60) riskScore += 30;
  else if (ageMinutes < 1440) riskScore += 15; // 24 hours
  else if (ageMinutes > 10080) riskScore -= 20; // 1 week

  // Mention factor (more mentions = less risky)
  if (mentions.length > 5) riskScore -= 20;
  else if (mentions.length > 2) riskScore -= 10;
  else if (mentions.length === 1) riskScore += 15;

  // Social engagement factor
  const totalEngagement = tweetData.reduce((sum, tweet) => 
    sum + (tweet.public_metrics?.like_count || 0) + 
    (tweet.public_metrics?.retweet_count || 0), 0);
  
  if (totalEngagement > 100) riskScore -= 15;
  else if (totalEngagement < 10) riskScore += 10;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(riskScore)));
};

// Generate tags based on contract characteristics
const generateTags = (contractInfo, riskScore, ageMinutes, mentions) => {
  const tags = [];

  if (riskScore < 30) tags.push('LOW_RISK');
  else if (riskScore > 70) tags.push('HIGH_RISK');

  if (ageMinutes < 60) tags.push('FRESH');
  else if (ageMinutes < 1440) tags.push('NEW');

  if (mentions.length > 3) tags.push('TRENDING');
  
  // Check if mentioned by top alpha hunters
  const topHunters = ['degenspartan', 'SolBigBrain', '0xSisyphus'];
  if (mentions.some(m => topHunters.includes(m))) {
    tags.push('ALPHA_HUNTER');
  }

  return tags;
};

// Main endpoint to scan for new contracts
app.get('/api/scan', async (req, res) => {
  try {
    console.log('Starting contract scan...');
    const allTweets = [];
    const contractAddresses = new Set();
    const mentionMap = new Map(); // address -> [usernames]
    const tweetMap = new Map(); // address -> [tweets]

    // Fetch tweets from all alpha hunters
    for (const hunter of ALPHA_HUNTERS) {
      try {
        const tweets = await fetchAlphaHunterTweets(hunter, 20);
        
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
        
        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Failed to fetch tweets for ${hunter}:`, error.message);
        continue;
      }
    }

    console.log(`Found ${contractAddresses.size} unique contract addresses`);

    // Process each contract
    const contracts = [];
    for (const address of contractAddresses) {
      try {
        const contractInfo = await getContractInfo(address);
        if (!contractInfo) continue;

        const mentions = mentionMap.get(address) || [];
        const tweets = tweetMap.get(address) || [];
        
        const ageMinutes = (Date.now() - contractInfo.deployedAt.getTime()) / (1000 * 60);
        
        // Skip very old contracts (older than 7 days) unless they're trending
        if (ageMinutes > 10080 && mentions.length < 3) continue;

        const riskScore = calculateRiskScore(contractInfo, tweets, mentions);
        const tags = generateTags(contractInfo, riskScore, ageMinutes, mentions);
        
        // Calculate scores
        const socialScore = Math.min(100, mentions.length * 15 + 
          tweets.reduce((sum, t) => sum + (t.public_metrics?.like_count || 0), 0) / 10);
        
        const liquidityScore = Math.max(20, 100 - riskScore); // Inverse relationship for demo
        
        // Generate mock token info (in real implementation, you'd fetch from token metadata)
        const tokenInfo = {
          symbol: `TOKEN${address.slice(-4).toUpperCase()}`,
          name: `Token ${address.slice(0, 4)}...${address.slice(-4)}`,
          marketCap: Math.floor(Math.random() * 1000000) + 5000,
          holders: Math.floor(Math.random() * 50000) + 100,
          description: `Contract ${address.slice(0, 8)}... mentioned by ${mentions.join(', ')}`,
          verified: riskScore < 40 && mentions.length > 2
        };

        contracts.push({
          address,
          ...tokenInfo,
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
          tags
        });

        // Rate limiting for Solana RPC calls
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing contract ${address}:`, error.message);
        continue;
      }
    }

    // Sort by deployment time (newest first)
    contracts.sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());

    console.log(`Processed ${contracts.length} contracts`);

    res.json({
      success: true,
      data: contracts,
      meta: {
        total: contracts.length,
        lastUpdate: new Date(),
        huntersScanned: ALPHA_HUNTERS.length,
        totalTweets: allTweets.length
      }
    });

  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan for contracts',
      message: error.message
    });
  }
});

// Get details for a specific contract
app.get('/api/contract/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    const contractInfo = await getContractInfo(address);
    if (!contractInfo) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Search for tweets mentioning this contract
    const searchQuery = address;
    const searchUrl = 'https://api.twitter.com/2/tweets/search/recent';
    
    const response = await axios.get(searchUrl, {
      headers: getTwitterHeaders(),
      params: {
        query: searchQuery,
        'tweet.fields': 'created_at,public_metrics,author_id',
        'user.fields': 'username',
        'expansions': 'author_id',
        max_results: 50
      }
    });

    const tweets = response.data.data || [];
    const users = response.data.includes?.users || [];
    
    // Map author IDs to usernames
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
        contract: contractInfo,
        tweets: enrichedTweets,
        stats: {
          totalMentions: tweets.length,
          totalEngagement: tweets.reduce((sum, t) => 
            sum + (t.public_metrics?.like_count || 0) + 
            (t.public_metrics?.retweet_count || 0), 0)
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date(),
    services: {
      twitter: !!TWITTER_BEARER_TOKEN,
      solana: !!SOLANA_RPC_URL
    }
  });
});

// Get list of monitored alpha hunters
app.get('/api/hunters', (req, res) => {
  res.json({
    success: true,
    data: ALPHA_HUNTERS.map(hunter => ({
      username: hunter,
      url: `https://twitter.com/${hunter}`
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
      'GET /api/hunters'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Solana Alpha Hunter Backend running on port ${PORT}`);
  console.log(`📊 Monitoring ${ALPHA_HUNTERS.length} alpha hunters`);
  console.log(`🔑 Twitter API: ${TWITTER_BEARER_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  console.log(`⚡ Solana RPC: ${SOLANA_RPC_URL}`);
});