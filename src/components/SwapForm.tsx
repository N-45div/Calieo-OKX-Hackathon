import { useState, useEffect } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import { ArrowDown, Loader2 } from "lucide-react";
import axios from "axios";
import { VersionedTransaction, ComputeBudgetProgram, PublicKey, TransactionInstruction, MessageV0, AddressLookupTableAccount } from "@solana/web3.js";
import base58 from "bs58";

// Backend API URL (adjust based on your backend deployment)
const BACKEND_API_URL = "http://localhost:3001";

interface SwapFormProps {
  walletProvider?: Provider;
  balance: string;
}

interface QuoteData {
  toTokenAmount: string;
  fromToken: {
    tokenSymbol: string;
    decimal: string;
    tokenUnitPrice: string | null;
  };
  toToken: {
    tokenSymbol: string;
    decimal: string;
    tokenUnitPrice: string | null;
  };
}

interface SwapResult {
  success: boolean;
  orderId?: string;
  txHash?: string;
  status?: string;
  error?: string;
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

interface OKXSwapData {
  tx: {
    data: string;
  };
}

export default function SwapForm({ balance }: SwapFormProps) {
  const { isConnected, address } = useAppKitAccount();
  const { connection } = useAppKitConnection();
  const { walletProvider } = useAppKitProvider<Provider>("solana");

  const [fromTokenAddress, setFromTokenAddress] = useState<string>("So11111111111111111111111111111111111111112"); // SOL
  const [toTokenAddress, setToTokenAddress] = useState<string>("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
  const [amount, setAmount] = useState<string>("");
  const [slippage] = useState<string>("0.5"); // Fixed slippage for simplicity
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Debug wallet connection state
  useEffect(() => {
    console.log("Wallet connected:", isConnected, "Address:", address, "Provider:", walletProvider);
  }, [isConnected, address, walletProvider]);

  // Fetch quote when tokens or amount change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amount || !fromTokenAddress || !toTokenAddress || parseFloat(amount) <= 0) {
        setQuote(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const decimals = fromTokenAddress === "So11111111111111111111111111111111111111112" ? 9 : 6;
        const amountInUnits = (parseFloat(amount) * Math.pow(10, decimals)).toString();
        
        const response = await axios.post(`${BACKEND_API_URL}/api/swap/quote`, {
          fromTokenAddress,
          toTokenAddress,
          amount: amountInUnits,
        });

        if (!response.data.success || !response.data.data) {
          throw new Error(response.data.error || "Failed to fetch quote");
        }

        setQuote(response.data.data);
      } catch (err) {
        setError("Failed to fetch quote");
        console.error("Quote fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [fromTokenAddress, toTokenAddress, amount]);

  // Get priority fee for Solana transaction
  const getPriorityFee = async (): Promise<number> => {
    try {
      if (!connection) {
        throw new Error("Solana connection is not available.");
      }
      const recentFees = await connection.getRecentPrioritizationFees();
      const maxFee = Math.max(...recentFees.map(fee => fee.prioritizationFee), 10000);
      return Math.min(maxFee * 2, 100000);
    } catch (error) {
      console.error("Error getting priority fee, using default:", error);
      return 10000;
    }
  };

  // Prepare transaction for signing (Updated to handle both instructionLists and callData)
  const prepareTransaction = async (swapData: OKXSwapInstructionsData | OKXSwapData, userAddress: string): Promise<VersionedTransaction> => {
    try {
      if (!connection) {
        throw new Error("Solana connection is not available.");
      }
      const recentBlockhash = await connection.getLatestBlockhash('confirmed');

      // Check if swapData contains instructionLists (from /swap-instruction)
      if ('instructionLists' in swapData && 'addressLookupTableAccount' in swapData) {
        const swapInstructionsData = swapData as OKXSwapInstructionsData;

        // Fetch Address Lookup Tables (LUTs)
        const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
        if (swapInstructionsData.addressLookupTableAccount && swapInstructionsData.addressLookupTableAccount.length > 0) {
          const lutPromises = swapInstructionsData.addressLookupTableAccount.map(async (lutAddress) => {
            try {
              const lutPubkey = new PublicKey(lutAddress);
              const lutAccount = await connection.getAddressLookupTable(lutPubkey);
              return lutAccount.value;
            } catch (error) {
              console.error(`Error fetching LUT ${lutAddress}:`, error);
              return null;
            }
          });
          const lutResults = await Promise.all(lutPromises);
          addressLookupTableAccounts.push(...lutResults.filter((lut): lut is AddressLookupTableAccount => lut !== null));
        }

        // Construct Transaction Instructions
        const instructions: TransactionInstruction[] = [];

        // Add compute budget and priority fee instructions
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 300000,
        });
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: await getPriorityFee(),
        });
        instructions.push(computeBudgetIx, priorityFeeIx);

        // Add swap instructions
        swapInstructionsData.instructionLists.forEach((instr) => {
          const accounts = instr.accounts.map((account) => ({
            pubkey: new PublicKey(account.pubkey),
            isSigner: account.isSigner,
            isWritable: account.isWritable,
          }));

          const instruction = new TransactionInstruction({
            keys: accounts,
            programId: new PublicKey(instr.programId),
            data: Buffer.from(instr.data, 'hex'),
          });

          instructions.push(instruction);
        });

        // Create a new MessageV0
        const messageV0 = MessageV0.compile({
          payerKey: new PublicKey(userAddress),
          instructions,
          recentBlockhash: recentBlockhash.blockhash,
          addressLookupTableAccounts,
        });

        // Create a new VersionedTransaction
        const transaction = new VersionedTransaction(messageV0);
        console.log("Prepared transaction from instructionLists:", {
          instructions: transaction.message.compiledInstructions.length,
          staticAccountKeys: transaction.message.staticAccountKeys.map(key => key.toBase58()),
          addressTableLookups: transaction.message.addressTableLookups,
        });

        return transaction;
      } else if ('tx' in swapData && 'data' in swapData.tx) {
        // Handle callData from /swap endpoint
        const swapDataWithCallData = swapData as OKXSwapData;
        const callData = swapDataWithCallData.tx.data;

        console.log("Decoding callData:", callData);
        const decodedTransaction = base58.decode(callData);
        const tx = VersionedTransaction.deserialize(decodedTransaction);
        console.log("Deserialized transaction:", {
          message: tx.message,
          signatures: tx.signatures,
          staticAccountKeys: tx.message.staticAccountKeys.map(key => key.toBase58()),
        });

        const message = tx.message;

        // Add compute budget and priority fee instructions
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 300000,
        });
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: await getPriorityFee(),
        });

        if ('version' in message && message.version === 0) {
          const messageV0 = message as MessageV0;

          // Fetch Address Lookup Tables (LUTs) if present
          const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
          if (messageV0.addressTableLookups && messageV0.addressTableLookups.length > 0) {
            const lutPromises = messageV0.addressTableLookups.map(async (lookup) => {
              try {
                const lutPubkey = new PublicKey(lookup.accountKey);
                const lutAccount = await connection.getAddressLookupTable(lutPubkey);
                return lutAccount.value;
              } catch (error) {
                console.error(`Error fetching LUT ${lookup.accountKey.toBase58()}:`, error);
                return null;
              }
            });
            const lutResults = await Promise.all(lutPromises);
            addressLookupTableAccounts.push(...lutResults.filter((lut): lut is AddressLookupTableAccount => lut !== null));
          }

          const allInstructions: TransactionInstruction[] = [
            computeBudgetIx,
            priorityFeeIx,
            ...messageV0.compiledInstructions.map((compiledIx) => {
              if (compiledIx.programIdIndex >= messageV0.staticAccountKeys.length) {
                throw new Error(`Invalid programIdIndex ${compiledIx.programIdIndex}. staticAccountKeys length: ${messageV0.staticAccountKeys.length}`);
              }
              const programId = messageV0.staticAccountKeys[compiledIx.programIdIndex];
              if (!programId) {
                throw new Error(`Program ID at index ${compiledIx.programIdIndex} is undefined`);
              }

              const keys = compiledIx.accountKeyIndexes.map((idx) => {
                if (idx >= messageV0.staticAccountKeys.length) {
                  throw new Error(`Invalid accountKeyIndex ${idx}. staticAccountKeys length: ${messageV0.staticAccountKeys.length}`);
                }
                const pubkey = messageV0.staticAccountKeys[idx];
                if (!pubkey) {
                  throw new Error(`Account key at index ${idx} is undefined`);
                }
                return {
                  pubkey,
                  isSigner: messageV0.isAccountSigner(idx),
                  isWritable: messageV0.isAccountWritable(idx),
                };
              });

              return new TransactionInstruction({
                keys,
                programId,
                data: Buffer.from(compiledIx.data),
              });
            }),
          ];

          const newMessageV0 = MessageV0.compile({
            payerKey: new PublicKey(userAddress),
            instructions: allInstructions,
            recentBlockhash: recentBlockhash.blockhash,
            addressLookupTableAccounts,
          });

          const newTx = new VersionedTransaction(newMessageV0);
          console.log("Prepared transaction from callData:", {
            instructions: newTx.message.compiledInstructions.length,
            staticAccountKeys: newTx.message.staticAccountKeys.map(key => key.toBase58()),
            addressTableLookups: newTx.message.addressTableLookups,
          });

          return newTx;
        } else {
          throw new Error("Unsupported message version. Expected MessageV0.");
        }
      } else {
        throw new Error("Invalid swap data format received from backend");
      }
    } catch (error) {
      console.error("Error preparing transaction:", error);
      throw new Error("Failed to prepare transaction for signing: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Fetch swap data from backend
  const fetchSwapData = async (fromTokenAddress: string, toTokenAddress: string, amount: string, userAddress: string, slippage: string) => {
    try {
      const response = await axios.post(`${BACKEND_API_URL}/api/swap/execute`, {
        fromTokenAddress,
        toTokenAddress,
        amount,
        userAddress,
        slippage,
        signedTx: "pending", // Placeholder to get swap instructions
      });

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || "Failed to fetch swap data");
      }

      return response.data.data;
    } catch (error) {
      console.error("Error fetching swap data:", error);
      throw error;
    }
  };

  // Execute swap with signed transaction
  const executeSwap = async (fromTokenAddress: string, toTokenAddress: string, amount: string, userAddress: string, slippage: string, signedTx: string) => {
    try {
      const response = await axios.post(`${BACKEND_API_URL}/api/swap/execute`, {
        fromTokenAddress,
        toTokenAddress,
        amount,
        userAddress,
        slippage,
        signedTx,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || "Swap execution failed");
      }

      return response.data.data;
    } catch (error) {
      console.error("Error executing swap:", error);
      throw error;
    }
  };

  // Handle swap execution
  const handleSwap = async () => {
    if (!isConnected || !walletProvider || !address || !amount || !fromTokenAddress || !toTokenAddress) {
      setError("Please connect wallet and fill in all fields");
      return;
    }

    if (parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    // Check balance
    const balanceInLamports = parseFloat(balance) * Math.pow(10, 9);
    const amountInLamports = parseFloat(amount) * Math.pow(10, 9);
    if (amountInLamports > balanceInLamports) {
      setError("Insufficient balance for the swap.");
      return;
    }

    setLoading(true);
    setError(null);
    setSwapResult(null);

    try {
      const userAddress = address;
      const decimals = fromTokenAddress === "So11111111111111111111111111111111111111112" ? 9 : 6;
      const amountInUnits = (parseFloat(amount) * Math.pow(10, decimals)).toString();

      // Step 1: Fetch swap instructions from backend
      console.log("Fetching swap instructions...");
      const swapData: OKXSwapInstructionsData | OKXSwapData = await fetchSwapData(fromTokenAddress, toTokenAddress, amountInUnits, userAddress, slippage);

      // Step 2: Prepare the transaction
      console.log("Preparing transaction...");
      const transaction = await prepareTransaction(swapData, userAddress);

      // Step 3: Sign and send the transaction
      console.log("Sending transaction to wallet for signing...");
      if (!connection) {
        throw new Error("Solana connection is not available.");
      }
      const signature = await walletProvider.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      console.log("Transaction signed, signature:", signature);

      // Step 4: Serialize the signed transaction for the backend
      const signedTx = base58.encode(transaction.serialize());
      console.log("Serialized signed transaction:", signedTx);

      // Step 5: Execute the swap with the signed transaction
      console.log("Executing swap with signed transaction...");
      const { orderId, txHash, status } = await executeSwap(
        fromTokenAddress,
        toTokenAddress,
        amountInUnits,
        userAddress,
        slippage,
        signedTx
      );

      setSwapResult({
        success: true,
        orderId,
        txHash,
        status,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("User rejected")) {
          setError("Swap failed: You rejected the transaction in your wallet.");
        } else if (err.message.includes("blockhash")) {
          setError("Swap failed: Transaction blockhash is stale. Please try again.");
        } else if (err.message.includes("insufficient")) {
          setError("Swap failed: Insufficient funds or balance for the transaction.");
        } else {
          setError(`Swap failed: ${err.message}`);
        }
      } else {
        setError("Swap failed: An unexpected error occurred.");
      }
      console.error("Swap error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Ensure toTokenAddress updates if fromTokenAddress changes to the same value
  useEffect(() => {
    if (fromTokenAddress === toTokenAddress) {
      setToTokenAddress(fromTokenAddress === "So11111111111111111111111111111111111111112" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "So11111111111111111111111111111111111111112");
    }
  }, [fromTokenAddress]);

  useEffect(() => {
    if (toTokenAddress === fromTokenAddress) {
      setFromTokenAddress(toTokenAddress === "So11111111111111111111111111111111111111112" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "So11111111111111111111111111111111111111112");
    }
  }, [toTokenAddress]);

  return (
    <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl w-full max-w-md mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-4">Swap Tokens</h2>

      {/* Swap Form */}
      <div className="space-y-4">
        {/* From Token */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">From</label>
          <select
            value={fromTokenAddress}
            onChange={(e) => setFromTokenAddress(e.target.value)}
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="So11111111111111111111111111111111111111112">SOL</option>
            <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="mt-2 w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <p className="text-sm text-gray-400 mt-1">Balance: {balance} SOL</p>
        </div>

        {/* Swap Arrow */}
        <div className="flex justify-center">
          <ArrowDown className="w-6 h-6 text-gray-400" />
        </div>

        {/* To Token */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">To</label>
          <select
            value={toTokenAddress}
            onChange={(e) => setToTokenAddress(e.target.value)}
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
            <option value="So11111111111111111111111111111111111111112">SOL</option>
          </select>
          {quote && (
            <p className="mt-2 text-sm text-gray-300">
              Estimated Output: {(parseFloat(quote.toTokenAmount) / Math.pow(10, parseInt(quote.toToken.decimal))).toFixed(4)} {quote.toToken.tokenSymbol}
            </p>
          )}
        </div>

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={loading || !isConnected || !amount || parseFloat(amount) <= 0}
          className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 ${
            loading || !isConnected || !amount || parseFloat(amount) <= 0
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700'
          } text-white flex items-center justify-center gap-2`}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Swapping...
            </>
          ) : (
            'Swap'
          )}
        </button>

        {/* Swap Result */}
        {swapResult && (
          <div className="p-4 bg-gray-700 rounded-lg mt-4">
            {swapResult.success ? (
              <>
                <p className="text-sm text-green-400">Swap Successful!</p>
                <p className="text-sm">Transaction Hash: {swapResult.txHash}</p>
                <p className="text-sm">Status: {swapResult.status}</p>
              </>
            ) : (
              <p className="text-sm text-red-400">Swap Failed: {swapResult.error}</p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-600 rounded-lg mt-4">
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}