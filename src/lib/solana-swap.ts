/* eslint-disable @typescript-eslint/no-unused-vars */
import base58 from "bs58";
import * as solanaWeb3 from "@solana/web3.js";
import { Connection, Transaction, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import CryptoJS from "crypto-js";
import axios from "axios";
import type { WalletContextState } from "@solana/wallet-adapter-react";

// Constants
const SOLANA_CHAIN_ID = "501"; // Solana Mainnet
const CONFIRMATION_TIMEOUT = 60000;
const POLLING_INTERVAL = 5000;
const BASE_URL = "https://web3.okx.com";

// API Credentials (Hardcoded for simplicity; use a backend in production)
const apiKey = process.env.OKX_API_KEY || "";
const secretKey = process.env.OKX_SECRET_KEY || "";
const apiPassphrase = process.env.OKX_API_PASSPHRASE || "";
const projectId = process.env.OKX_PROJECT_ID || "";

// Rate limiting configuration
const RATE_LIMIT = {
    MAX_REQUESTS_PER_MINUTE: 10,
    REQUESTS_WINDOW_MS: 60000,
    MIN_REQUEST_INTERVAL: 1000,
    BACKOFF_MULTIPLIER: 1.5,
    MAX_BACKOFF_DELAY: 30000,
    MAX_RETRIES: 3,
} as const;

// Request tracking for rate limiting
let requestHistory: number[] = [];
let lastRequestTime = 0;

// Initialize Solana Connection
const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=2d8978c6-7067-459f-ae97-7ea035f1a0cb", {
    confirmTransactionInitialTimeout: 30000,
});

// In-memory cache for token info and quotes
const tokenInfoCache: Map<string, { data: TokenInfo; timestamp: number }> = new Map();
const quoteCache: Map<string, { data: QuoteData; timestamp: number }> = new Map();
const CACHE_DURATION = 30 * 60 * 1000;

// Rate limiting function
async function enforceRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests from history
    requestHistory = requestHistory.filter(time => now - time < RATE_LIMIT.REQUESTS_WINDOW_MS);
    
    // Check if we're hitting rate limits
    if (requestHistory.length >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
        const oldestRequest = Math.min(...requestHistory);
        const waitTime = RATE_LIMIT.REQUESTS_WINDOW_MS - (now - oldestRequest);
        console.log(`Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return enforceRateLimit();
    }
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT.MIN_REQUEST_INTERVAL) {
        const waitTime = RATE_LIMIT.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        console.log(`Enforcing minimum request interval, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    requestHistory.push(Date.now());
    lastRequestTime = Date.now();
}

// Utility Functions
async function getPriorityFee(): Promise<number> {
    try {
        const recentFees = await connection.getRecentPrioritizationFees();
        const maxFee = Math.max(...recentFees.map(fee => fee.prioritizationFee), 10000);
        return Math.min(maxFee * 2, 100000);
    } catch (error) {
        console.error("Error getting priority fee, using default:", error);
        return 10000;
    }
}

function getHeaders(timestamp: string, method: string, requestPath: string, queryString = "", body = ""): Record<string, string> {
    if (!apiKey || !secretKey || !apiPassphrase || !projectId) {
        throw new Error("Missing required environment variables for API authentication");
    }
    
    const fullPath = method === "GET" && queryString ? requestPath + queryString : requestPath;
    const stringToSign = timestamp + method + fullPath + (method === "POST" ? body : "");
    
    return {
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": CryptoJS.enc.Base64.stringify(
            CryptoJS.HmacSHA256(stringToSign, secretKey)
        ),
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": apiPassphrase,
        "OK-ACCESS-PROJECT": projectId,
    };
}

function convertAmount(amount: string, decimals: number): string {
    try {
        if (!amount || isNaN(parseFloat(amount))) {
            throw new Error("Invalid amount");
        }
        const value = parseFloat(amount);
        if (value <= 0) {
            throw new Error("Amount must be greater than 0");
        }
        
        // Simple string-based calculation to avoid precision issues
        const multiplier = Math.pow(10, decimals);
        const result = Math.floor(value * multiplier);
        return result.toString();
    } catch (err) {
        console.error("Amount conversion error:", err);
        throw new Error("Invalid amount format");
    }
}

// Validation functions
function validateTokenInfo(data: any): boolean {
    return data && 
           data.fromToken && 
           data.toToken && 
           typeof data.fromToken.tokenSymbol === 'string' &&
           typeof data.toToken.tokenSymbol === 'string' &&
           !isNaN(parseInt(data.fromToken.decimal)) &&
           !isNaN(parseInt(data.toToken.decimal));
}

function validateQuoteData(data: any): boolean {
    return data &&
           data.toTokenAmount &&
           !isNaN(parseFloat(data.toTokenAmount)) &&
           validateTokenInfo(data);
}

interface TokenInfo {
    fromToken: { symbol: string; decimals: number; price: string };
    toToken: { symbol: string; decimals: number; price: string };
}

interface QuoteData {
    toAmount: string;
    fromToken: { symbol: string; decimals: number; price: string };
    toToken: { symbol: string; decimals: number; price: string };
}

async function fetchWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = RATE_LIMIT.MAX_RETRIES,
    baseDelay: number = 2000
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            await enforceRateLimit();
            return await fn();
        } catch (error: any) {
            const isRateLimit = error.response?.status === 429;
            const isServerError = error.response?.status >= 500;
            const shouldRetry = (isRateLimit || isServerError) && i < retries - 1;
            
            if (shouldRetry) {
                let delay = baseDelay * Math.pow(RATE_LIMIT.BACKOFF_MULTIPLIER, i);
                
                if (isRateLimit) {
                    delay = Math.min(delay * 3, RATE_LIMIT.MAX_BACKOFF_DELAY);
                    console.log(`Rate limit hit (429), backing off for ${delay}ms... (Attempt ${i + 1}/${retries})`);
                } else {
                    delay = Math.min(delay, RATE_LIMIT.MAX_BACKOFF_DELAY);
                    console.log(`Server error (${error.response?.status}), retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            console.error(`Request failed after ${i + 1} attempts:`, error.message);
            throw error;
        }
    }
    throw new Error("Max retries reached");
}

async function getTokenInfo(fromTokenAddress: string, toTokenAddress: string): Promise<TokenInfo> {
    const cacheKey = `${fromTokenAddress}-${toTokenAddress}`;
    const cached = tokenInfoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Cache hit for token info: ${cacheKey}`);
        return cached.data;
    }

    console.log(`Fetching token info: ${cacheKey}...`);
    const timestamp = new Date().toISOString();
    const path = `dex/aggregator/quote`;
    const requestPath = `/api/v5/${path}`;
    
    const params: Record<string, string> = {
        chainIndex: SOLANA_CHAIN_ID,
        fromTokenAddress,
        toTokenAddress,
        amount: "1000000",
        slippage: "0.5",
    };
    
    const queryString = "?" + new URLSearchParams(params).toString();
    const headers = getHeaders(timestamp, "GET", requestPath, queryString);

    const response = await fetchWithBackoff(() =>
        axios.get(`${BASE_URL}${requestPath}${queryString}`, { headers, timeout: 15000 })
    );

    if (response.data.code !== "0" || !response.data.data?.[0]) {
        throw new Error(`Failed to get token information: ${response.data.msg || 'Unknown error'}`);
    }

    const quoteData = response.data.data[0];
    
    if (!validateTokenInfo(quoteData)) {
        throw new Error("Invalid token information received from API");
    }

    const tokenInfo: TokenInfo = {
        fromToken: {
            symbol: quoteData.fromToken.tokenSymbol,
            decimals: parseInt(quoteData.fromToken.decimal),
            price: quoteData.fromToken.tokenUnitPrice || "0",
        },
        toToken: {
            symbol: quoteData.toToken.tokenSymbol,
            decimals: parseInt(quoteData.toToken.decimal),
            price: quoteData.toToken.tokenUnitPrice || "0",
        },
    };

    tokenInfoCache.set(cacheKey, { data: tokenInfo, timestamp: Date.now() });
    console.log(`Cached token info for ${cacheKey}`);
    return tokenInfo;
}

async function getQuote(fromTokenAddress: string, toTokenAddress: string, amount: string): Promise<QuoteData> {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error("Invalid amount provided for quote");
    }

    const cacheKey = `${fromTokenAddress}-${toTokenAddress}-${amount}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Cache hit for quote: ${cacheKey}`);
        return cached.data;
    }

    console.log(`Fetching quote: ${cacheKey}...`);
    const timestamp = new Date().toISOString();
    const path = `dex/aggregator/quote`;
    const requestPath = `/api/v5/${path}`;
    
    const params: Record<string, string> = {
        chainIndex: SOLANA_CHAIN_ID,
        fromTokenAddress,
        toTokenAddress,
        amount,
        slippage: "0.5",
    };
    
    const queryString = "?" + new URLSearchParams(params).toString();
    const headers = getHeaders(timestamp, "GET", requestPath, queryString);

    const response = await fetchWithBackoff(() =>
        axios.get(`${BASE_URL}${requestPath}${queryString}`, { headers, timeout: 15000 })
    );

    if (response.data.code !== "0" || !response.data.data?.[0]) {
        throw new Error(`Failed to get quote: ${response.data.msg || 'Unknown error'}`);
    }

    const quoteData = response.data.data[0];
    
    if (!validateQuoteData(quoteData)) {
        console.error("Invalid quote data received:", quoteData);
        throw new Error("Invalid quote data received from API");
    }

    const toAmountNum = parseFloat(quoteData.toTokenAmount);
    if (isNaN(toAmountNum) || toAmountNum <= 0) {
        console.error("Invalid toTokenAmount in quote data:", quoteData.toTokenAmount);
        throw new Error("Invalid quote amount received from API");
    }

    const quote: QuoteData = {
        toAmount: quoteData.toTokenAmount,
        fromToken: {
            symbol: quoteData.fromToken.tokenSymbol,
            decimals: parseInt(quoteData.fromToken.decimal),
            price: quoteData.fromToken.tokenUnitPrice || "0",
        },
        toToken: {
            symbol: quoteData.toToken.tokenSymbol,
            decimals: parseInt(quoteData.toToken.decimal),
            price: quoteData.toToken.tokenUnitPrice || "0",
        },
    };

    quoteCache.set(cacheKey, { data: quote, timestamp: Date.now() });
    console.log(`Cached quote for ${cacheKey}`);
    return quote;
}

interface SwapData {
    tx: {
        data: string;
        from: string;
        to: string;
        value: string;
        gas: string;
        gasPrice?: string;
    };
    routerResult: any;
}

async function getSwapData(
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    userAddress: string,
    slippage = "0.5"
): Promise<SwapData> {
    console.log(`Getting swap data for ${amount} from ${fromTokenAddress} to ${toTokenAddress}`);
    
    const timestamp = new Date().toISOString();
    const path = `dex/aggregator/swap`;
    const requestPath = `/api/v5/${path}`;
    
    const params: Record<string, string> = {
        chainIndex: SOLANA_CHAIN_ID,
        fromTokenAddress,
        toTokenAddress,
        amount,
        slippage,
        userWalletAddress: userAddress,
        priceImpactProtectionPercentage: "0.9",
    };
    
    const queryString = "?" + new URLSearchParams(params).toString();
    const headers = getHeaders(timestamp, "GET", requestPath, queryString);
    
    console.log("Swap request URL:", `${BASE_URL}${requestPath}${queryString}`);

    const response = await fetchWithBackoff(() =>
        axios.get(`${BASE_URL}${requestPath}${queryString}`, { 
            headers, 
            timeout: 20000
        })
    );

    console.log("Swap API response:", {
        code: response.data.code,
        msg: response.data.msg,
        hasData: !!response.data.data,
        dataLength: response.data.data?.length || 0
    });

    if (response.data.code !== "0") {
        throw new Error(`Swap API Error (${response.data.code}): ${response.data.msg || "Unknown error"}`);
    }
    
    if (!response.data.data?.[0]) {
        throw new Error("No swap data returned from API");
    }

    const swapData = response.data.data[0];
    
    if (!swapData.tx || !swapData.tx.data) {
        console.error("Invalid swap data structure:", swapData);
        throw new Error("Invalid swap transaction data received from API");
    }

    console.log("Swap data received successfully");
    return swapData;
}

async function prepareTransaction(callData: string): Promise<Transaction | VersionedTransaction> {
    try {
        const decodedTransaction = base58.decode(callData);
        const recentBlockhash = await connection.getLatestBlockhash('confirmed');
        
        try {
            // Try VersionedTransaction first
            const tx = VersionedTransaction.deserialize(decodedTransaction);
            tx.message.recentBlockhash = recentBlockhash.blockhash;
            return tx;
        } catch {
            // Fall back to legacy Transaction
            const tx = Transaction.from(decodedTransaction);
            tx.recentBlockhash = recentBlockhash.blockhash;
            tx.feePayer = tx.instructions[0]?.keys[0]?.pubkey;

            // Add compute budget instructions
            const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 300000,
            });
            const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: await getPriorityFee(),
            });
            
            tx.add(computeBudgetIx, priorityFeeIx);
            return tx;
        }
    } catch (error) {
        console.error("Error preparing transaction:", error);
        throw new Error("Failed to prepare transaction for signing");
    }
}

async function signTransaction(tx: Transaction | VersionedTransaction, wallet: WalletContextState): Promise<Transaction | VersionedTransaction> {
    if (!wallet) {
        throw new Error("Wallet not connected");
    }
    if (!wallet.signTransaction) {
        throw new Error("Wallet does not support transaction signing");
    }
    if (!wallet.publicKey) {
        throw new Error("Wallet public key not available");
    }

    try {
        console.log("Signing transaction...");
        const signedTx = await wallet.signTransaction(tx);
        console.log("Transaction signed successfully");
        return signedTx;
    } catch (error) {
        console.error("Error signing transaction:", error);
        throw new Error("Failed to sign transaction");
    }
}

async function broadcastTransaction(signedTx: Transaction | VersionedTransaction): Promise<string> {
    try {
        console.log("Broadcasting transaction...");
        
        // Serialize the transaction properly
        let serializedTx: Uint8Array;
        if (signedTx instanceof VersionedTransaction) {
            serializedTx = signedTx.serialize();
        } else {
            serializedTx = signedTx.serialize();
        }
        
        const encodedTx = base58.encode(serializedTx);
        
        const path = `dex/pre-transaction/broadcast-transaction`;
        const requestPath = `/api/v5/${path}`;
        
        const broadcastData = {
            signedTx: encodedTx,
            chainIndex: SOLANA_CHAIN_ID,
        };
        
        const bodyString = JSON.stringify(broadcastData);
        const timestamp = new Date().toISOString();
        const headers = getHeaders(timestamp, "POST", requestPath, "", bodyString);

        console.log("Broadcasting to:", `${BASE_URL}${requestPath}`);
        console.log("Broadcast data:", { ...broadcastData, signedTx: "[REDACTED]" });
        
        const response = await fetchWithBackoff(() =>
            axios.post(`${BASE_URL}${requestPath}`, broadcastData, { 
                headers, 
                timeout: 20000 
            })
        );

        console.log("Broadcast response:", {
            code: response.data.code,
            msg: response.data.msg,
            hasData: !!response.data.data
        });

        if (response.data.code === "0" && response.data.data?.[0]?.orderId) {
            const orderId = response.data.data[0].orderId;
            console.log("Transaction broadcasted successfully, orderId:", orderId);
            return orderId;
        } else {
            throw new Error(`Broadcast failed: ${response.data.msg || "Unknown error"}`);
        }
    } catch (error) {
        console.error("Error broadcasting transaction:", error);
        throw new Error("Failed to broadcast transaction");
    }
}

interface TransactionStatus {
    orders: Array<{
        txStatus: string;
        txHash: string;
        failReason?: string;
    }>;
}

async function trackTransaction(orderId: string, intervalMs = POLLING_INTERVAL, timeoutMs = CONFIRMATION_TIMEOUT): Promise<TransactionStatus> {
    const startTime = Date.now();
    let lastStatus = "";
    
    console.log(`Tracking transaction with orderId: ${orderId}`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const path = `dex/post-transaction/orders`;
            const requestPath = `/api/v5/${path}`;
            
            const params = {
                orderId: orderId,
                chainIndex: SOLANA_CHAIN_ID,
                limit: "1",
            };
            
            const queryString = "?" + new URLSearchParams(params).toString();
            await enforceRateLimit();
            const headers = getHeaders(new Date().toISOString(), "GET", requestPath, queryString);

            const response = await fetchWithBackoff(() =>
                axios.get(`${BASE_URL}${requestPath}${queryString}`, { headers, timeout: 10000 })
            );

            if (response.data.code === "0" && response.data.data && response.data.data.length > 0) {
                if (response.data.data[0].orders && response.data.data[0].orders.length > 0) {
                    const txData = response.data.data[0] as TransactionStatus;
                    const status = txData.orders[0].txStatus;
                    
                    if (status !== lastStatus) {
                        lastStatus = status;
                        console.log(`Transaction status updated: ${status}`);
                        
                        if (status === "2") { // Success
                            console.log("Transaction confirmed successfully");
                            return txData;
                        } else if (status === "3") { // Failed
                            throw new Error(`Transaction failed: ${txData.orders[0].failReason || "Unknown reason"}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error tracking transaction:", error);
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error("Transaction tracking timed out");
}

export interface SwapResult {
    success: boolean;
    orderId?: string;
    txHash?: string;
    status?: string;
    error?: string;
}

export async function executeSwap(
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    wallet: WalletContextState,
    slippage = "0.5"
): Promise<SwapResult> {
    try {
        console.log("Starting swap execution...", {
            fromTokenAddress,
            toTokenAddress,
            amount,
            slippage,
            walletConnected: !!wallet.publicKey
        });

        if (!wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            throw new Error("Invalid swap amount");
        }

        const userAddress = wallet.publicKey.toBase58();
        console.log("User address:", userAddress);

        // Step 1: Get swap data
        const swapData = await getSwapData(fromTokenAddress, toTokenAddress, amount, userAddress, slippage);
        const callData = swapData.tx.data;

        if (!callData) {
            throw new Error("Invalid transaction data received from API");
        }

        // Step 2: Prepare transaction
        const transaction = await prepareTransaction(callData);

        // Step 3: Sign transaction
        const signedTx = await signTransaction(transaction, wallet);

        // Step 4: Broadcast transaction
        const orderId = await broadcastTransaction(signedTx);

        // Step 5: Track transaction
        const txStatus = await trackTransaction(orderId);

        return {
            success: true,
            orderId,
            txHash: txStatus.orders[0].txHash,
            status: txStatus.orders[0].txStatus === "2" ? "SUCCESS" : "PENDING",
        };
    } catch (error) {
        console.error("Swap execution error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred during swap",
        };
    }
}

// Helper function to clear caches manually if needed
export function clearCaches(): void {
    tokenInfoCache.clear();
    quoteCache.clear();
    requestHistory = [];
    console.log("All caches cleared");
}

export { getTokenInfo, convertAmount, getQuote };