# Calieo: Solana Trading Bot Telegram Mini App

## Overview

**Calieo** is a **Solana Trading Bot Telegram Mini App**, providing a powerful set of tools for cryptocurrency enthusiasts directly within **Telegram**. It includes:

- **Token Swapping** on Solana  
- **Arbitrage Opportunities** with real-time analysis  
- **Alpha Hunting** for newly deployed contracts  
- **Sentiment Analysis** of market-related text  

The app leverages the following technologies:

- **OKX DEX API**: For decentralized token swaps, price data, and candlestick charts  
- **Google Generative AI API**: For sentiment analysis of text data  
- **Helius RPC**: For Solana blockchain interactions  
- **Twitter API**: For real-time alpha hunting data (via backend)  
- **Advanced Rate Limiting**: To ensure efficient API usage  

> Built with **TypeScript** and **React** for the frontend, and **Express** with **Socket.IO** for the backend.

---

## Features

- **Token Swapping on Solana**: Seamlessly swap tokens like SOL and USDC using the OKX DEX API  
- **Arbitrage Opportunities Dashboard**: Real-time charts displaying cross-chain arbitrage opportunities  
- **Alpha Hunter**: Identify newly deployed Solana contracts with risk, liquidity, and social scores  
- **Sentiment Analysis**: Analyze token or market sentiment using Google Generative AI API  
- **Telegram Mini App Integration**: Launch directly via Telegram's menu button  
- **Rate Limiting**: Implements exponential backoff and request tracking for OKX API calls  
- **Helius RPC**: Reliable interaction with Solana Mainnet  
- **Error Handling**: Prevents NaN errors, includes mock data fallback for failed API calls  
- **Real-Time Updates**: WebSocket backend for live alpha hunting feed updates  

---

## Project Structure

- `src/lib/solana-swap.ts`: Handles OKX DEX API integration and Solana token swaps  
- `src/lib/sentimentAnalysis.ts`: Performs sentiment analysis using Google Generative AI API  
- `src/ArbitrageOpportunities.tsx`: Displays arbitrage opportunities with candlestick charts  
- `src/SolanaAlphaHunter.tsx`: UI for alpha hunting, showing newly deployed contracts  
- `src/App.tsx`: Main routing and UI layout for the Telegram Mini App  
- `src/SwapForm.tsx`: Form logic for token swapping  
- `backend/index.ts`: Backend WebSocket server for alpha hunting and Twitter scanning  
- `.env`: Stores API keys and configuration variables  

---

## Prerequisites

Ensure you have the following installed and set up:

- **Node.js** v16.x or higher  
- **Solana CLI** (for interacting with Solana blockchain)  
- **Telegram Bot** (create via BotFather on Telegram)  
- **OKX API Credentials** (API key, secret key, passphrase, project ID)  
- **Google API Key** (for Generative AI API)  
- **Helius RPC API Key** (for Solana Mainnet access)  
- **Solana Wallet** (e.g., Phantom, for token swaps)  
- **Twitter Bearer Token** (for backend alpha hunting)  

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/N-45div/Calieo-OKX-Hackathon.git
cd Calieo-OKX-Hackathon
```

### 2. Install Frontend Dependencies

Navigate to the frontend directory and install dependencies:

```bash
cd calieo-OKX-Hackathon
npm install
```

### 3. Install Backend Dependencies

Navigate to the backend directory and install dependencies:

```bash
cd backend
npm install
```

The backend requires the following packages (already included in `package.json`):

```bash
npm install express cors axios socket.io http node-cron dotenv crypto-js bs58 @solana/web3.js
npm install --save-dev @types/express @types/cors @types/socket.io @types/node-cron @types/crypto-js typescript ts-node
```

---

## Usage

### 1. Set Up Environment Variables

Create a `.env` file in both the `frontend` and `backend` directories.

#### Frontend `.env`

```env
VITE_OKX_API_KEY=your_okx_api_key
VITE_OKX_SECRET_KEY=your_secret_key
VITE_OKX_API_PASSPHRASE=your_passphrase
VITE_OKX_PROJECT_ID=your_project_id
VITE_GOOGLE_API_KEY=your_google_api_key
VITE_BACKEND_URL=http://localhost:3001
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_key
SOLANA_WALLET_ADDRESS=your_wallet_address
SOLANA_PRIVATE_KEY=your_private_key
```

#### Backend `.env`

```env
PORT=3001
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_key
OKX_API_KEY=your_okx_api_key
OKX_SECRET_KEY=your_secret_key
OKX_API_PASSPHRASE=your_passphrase
OKX_PROJECT_ID=your_project_id
```

**⚠️ Security Warning**: Never share your private keys or API credentials publicly. Use a secrets manager in production environments.

---

### 2. Start the Backend Server

Navigate to the backend directory and start the server:

```bash
cd backend
npm run build  # Compile TypeScript to JavaScript
npm start      # Start the server
```

Alternatively, use the development mode to run without compiling:

```bash
npm run dev
```

- The backend server starts on `http://localhost:3001`.
- It auto-scans Twitter every 10 minutes for alpha hunting and sends WebSocket updates to connected clients.

---

### 3. Start the Frontend Development Server

Navigate to the frontend directory and start the development server:

```bash
cd calieo-OKX-Hackathon
npm install
npm run dev
```

- The frontend will be accessible at `http://localhost:5173` (or another port if specified by Vite).

---

### 4. Access the Mini App in Telegram

1. Open Telegram and find your bot (created via BotFather).
2. Click the menu button to launch the Mini App.
3. Explore the available sections:
   - **Swap Interface**: For token swapping  
   - **Arbitrage Dashboard**: For cross-chain arbitrage opportunities  
   - **Alpha Hunter**: For discovering new Solana contracts  
   - **Sentiment Analysis**: For analyzing market sentiment  

---

### 5. Perform a Token Swap

1. Connect your Solana wallet (e.g., Phantom) via the Mini App.
2. Select input and output tokens (e.g., SOL to USDC).
3. Enter the amount and review the quote provided by the OKX DEX API.
4. Confirm the transaction.
   - Transactions use **account abstraction** for gasless execution where applicable.

---

### 6. Explore Arbitrage Opportunities

1. Navigate to the Arbitrage Dashboard.
2. Select a chain (e.g., Solana, Ethereum, BSC).
3. Set the timeframe for candlestick data (e.g., 1H, 1m).
4. Enter a token address (e.g., `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` for USDC on Ethereum) or use the default.
5. View profit percentages, volatility, and candlestick charts.

---

### 7. Use the Alpha Hunter

1. Navigate to the Alpha Hunter section.
2. Filter contracts by:
   - **Low Risk**: Contracts with a low risk score  
   - **Trending**: Contracts with high social engagement  
   - **Fresh**: Recently deployed contracts  
3. View real-time data including risk score, liquidity score, social mentions, and more.
4. Access external links like Solscan and DexScreener for further analysis.

---

### 8. Analyze Sentiment

1. Navigate to the Sentiment Analysis section.
2. Input text (e.g., a tweet, token description, or market commentary).
3. Receive an output with:
   - Sentiment: **Positive**, **Neutral**, or **Negative**
   - Confidence score (e.g., 85%)

---

## APIs Used

### OKX DEX API

| Endpoint                 | Purpose                     | Used In                                          |
|--------------------------|-----------------------------|--------------------------------------------------|
| `/price-info`            | Fetch batch token prices    | `backend/index.ts`, `Arbitrage.tsx`              |
| `/candles`               | Fetch candlestick data      | `Arbitrage.tsx`                                  |
| `/quote`                 | Get swap quote              | `backend/index.ts`                               |
| `/swap`                  | Execute token swap          | `backend/index.ts`                               |
| `/broadcast-transaction` | Broadcast transaction       | `backend/index.ts`                               |
| `/orders`                | Track transaction status    | `backend/index.ts`                               |

### Google Generative AI API

- Used for text sentiment analysis in `sentimentAnalysis.ts`.

### Twitter API

- Fetches tweets for alpha hunting in `backend/index.ts`.

### DexScreener API

- Retrieves token data by address in `backend/index.ts`.

### Backend WebSocket

- Provides real-time contract updates to `SolanaAlphaHunter.tsx`.

### Backend REST API

| Endpoint                 | Purpose                     |
|--------------------------|-----------------------------|
| `/api/scan`              | Get cached contracts        |
| `/api/contract/:address` | Detailed contract info      |
| `/api/scan/trigger`      | Trigger manual scan         |
| `/api/status`            | Backend status              |
| `/api/hunters`           | List monitored alpha hunters|
| `/api/market/candles`    | Fetch candlestick data      |
| `/api/market/price-info` | Fetch token price info      |
| `/api/swap/quote`        | Get swap quote              |
| `/api/swap/execute`      | Execute swap transaction    |

---

## Rate Limiting & Error Handling

### Frontend

- **Rate Limiting**:
  - Maximum 10 requests per minute, with a minimum 1-second gap between requests.
  - Implements **exponential backoff** with a maximum delay of 30 seconds.
  - Tracks request timestamps to enforce limits.
- **Error Handling**:
  - Prevents NaN errors from invalid quotes.
  - Falls back to mock data if API calls fail.
  - Uses default values if fee fetching fails.

### Backend

- **Rate Limiting**:
  - Adds delays between Twitter, Solana RPC, and DexScreener requests to avoid rate limits.
  - Implements retries with exponential backoff for OKX API calls (e.g., 429 Too Many Requests).
- **Error Handling**:
  - Falls back to cached data if live fetches fail.
  - Returns **neutral sentiment (0%)** if the sentiment API fails.
  - Logs detailed errors for debugging.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
