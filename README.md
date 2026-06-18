# Robinhood Stock Prediction Market

---

## Core Features

### Chain-Native Stock Token Integration
Each market is identified by a Robinhood Chain native stock token address — not a string ticker. `createMarket()` accepts `address stockToken` directly, anchoring the market to the actual on-chain RWA asset (TSLA: `0xC9f9c8...`, AMZN: `0x5884aD...`, PLTR: `0x1FBE1a...`).

### Chainlink-Compatible Oracle Interface
The contract uses `IPriceFeed` — a Chainlink `AggregatorV3Interface`-compatible interface. On testnet, a `MockPriceFeed` is deployed per stock. The architecture supports a drop-in replacement with live Chainlink feeds once they are listed on Robinhood Chain mainnet.

### Parimutuel Settlement
No order book, no counterparty risk. BULL pool and BEAR pool accumulate independently. At settlement, the winning side splits the total pool proportional to their stake, minus a 2% protocol fee.

### Full Market Lifecycle
`OPEN → LOCKED → SETTLED`. `lockMarket()` snapshots the opening price from the oracle. `settleMarket()` reads the closing price and determines the winning direction.

---

## Architecture

```
User
 |
 |-- placeBet(marketId, BULL/BEAR) --> StockPredictionMarket
 |                                           |
 |                                    +--------------+
 |                                    |    Market    |
 |                                    |    struct    |
 |                                    +------+-------+
 |                                           |
 |                              stockToken (RH Chain    priceFeed (Chainlink-
 |                              native TSLA/AMZN/PLTR)  compatible IPriceFeed)
 |
 +-- claimWinnings(marketId) <-- parimutuel payout (2% fee)
```

---

## Deployed Contracts

**Robinhood Chain Testnet (Chain ID: 46630)**

| Contract | Address |
|---|---|
| StockPredictionMarket | [`0x15636CE4C0EdE55335f84E6386f8F49C897c077d`](https://explorer.testnet.chain.robinhood.com/address/0x15636CE4C0EdE55335f84E6386f8F49C897c077d) |
| TSLA MockPriceFeed | [`0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f`](https://explorer.testnet.chain.robinhood.com/address/0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f) |
| AMZN MockPriceFeed | [`0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953`](https://explorer.testnet.chain.robinhood.com/address/0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953) |
| PLTR MockPriceFeed | [`0xBdC53E50b1167cE1199bFaD54A034f7ab1741051`](https://explorer.testnet.chain.robinhood.com/address/0xBdC53E50b1167cE1199bFaD54A034f7ab1741051) |
| NFLX MockPriceFeed | [`0xf6fdc6482221db4D7D285F96AdDa1914018C2642`](https://explorer.testnet.chain.robinhood.com/address/0xf6fdc6482221db4D7D285F96AdDa1914018C2642) |
| AMD MockPriceFeed | [`0xfCE76bbbdac30D17061f8Fc1f57Cd55dDa6BA40d`](https://explorer.testnet.chain.robinhood.com/address/0xfCE76bbbdac30D17061f8Fc1f57Cd55dDa6BA40d) |

**Robinhood Chain Stock Tokens (Official)**

| Token | Address |
|---|---|
| TSLA | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` |
| AMZN | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` |
| PLTR | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` |
| NFLX | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
| AMD | `0x71178BAc73cBeb415514eB542a8995b82669778d` |

---

## Quick Start

**Prerequisites**
- Node.js 18+
- A funded wallet on Robinhood Chain Testnet

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Deployer wallet private key (no 0x prefix) |

```bash
# 3. Compile
npx hardhat compile

# 4. Deploy to testnet
npx hardhat run scripts/deploy.js --network robinhoodTestnet
```

---

## Contract Interface

```solidity
// Create a new prediction round
createMarket(address stockToken, address priceFeed, string symbol, uint256 duration) returns (uint256 marketId)

// Place a bet (send ETH as value)
placeBet(uint256 marketId, Direction direction)  // Direction: 0 = BULL, 1 = BEAR

// Lock market and snapshot opening price
lockMarket(uint256 marketId)

// Settle market and determine winner
settleMarket(uint256 marketId)

// Claim winnings after settlement
claimWinnings(uint256 marketId)
```

---

## Fees & Security

**Fees**
- Protocol fee: 2% of total pool at settlement
- No winner scenario: all bets refunded in full

**Security**
- One bet per address per market
- Minimum bet enforced (0.001 ETH)
- Owner-only market lifecycle controls (createMarket, lockMarket, settleMarket)
- No reentrancy risk: claimed flag set before transfer

---

## Implementation Notes

**MockPriceFeed as Chainlink Drop-In**
Robinhood Chain's official Chainlink price feed contract addresses are not yet publicly listed in Chainlink documentation for the testnet. The `IPriceFeed` interface mirrors `AggregatorV3Interface` exactly — `latestRoundData()` and `decimals()` — so replacing `MockPriceFeed` with a live Chainlink feed requires only a constructor argument change, zero contract modifications.

**Stock Token as Market Identifier**
On most chains, a prediction market would use an arbitrary string or uint to identify a market. On Robinhood Chain, we use the native stock token contract address directly. This creates an on-chain verifiable link between the prediction market and the actual tokenized equity — something only possible on a chain purpose-built for RWA.

**ETH as Betting Asset (Testnet)**
Testnet uses ETH for betting. Mainnet architecture targets USDG (`0x7E955252E15c84f5768B83c41a71F9eba181802F` on testnet), Robinhood Chain's native stablecoin, for a fully chain-native settlement flow.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity ^0.8.20 |
| Development | Hardhat 3 + ethers.js |
| Oracle | MockPriceFeed (Chainlink AggregatorV3Interface-compatible) |
| Stock tokens | Robinhood Chain native (TSLA, AMZN, PLTR, NFLX, AMD) |
| Testnet gas | ETH (bridged from Sepolia via Arbitrum native bridge) |

---

## Roadmap

**✅ M1 — Contract Deployment (completed)**
- StockPredictionMarket deployed and verified on Robinhood Chain Testnet
- Parimutuel logic with BULL/BEAR markets for TSLA, AMZN, PLTR
- MockPriceFeed (Chainlink-compatible) per stock token
- Full market lifecycle: OPEN → LOCKED → SETTLED

**⬜ M2 — Frontend**
- React + wagmi frontend on Robinhood Chain Testnet
- Live market odds display, bet placement, claim UI
- Deploy to Vercel

**⬜ M3 — Mainnet**
- Replace MockPriceFeed with live Chainlink feeds
- Switch betting asset to USDG
- Deploy to Robinhood Chain Mainnet

---

## Developer

GitHub: [pplmaverick](https://github.com/pplmaverick)
Wallet: `0xed2B5717c9b936ecC76d75401026A99143e278F5`

## License

MIT
