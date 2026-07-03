export const MARKET_ADDRESS = '0x72DAb8B1B53b3CF028e9A0d1E21178981f264245'

export const STOCKS = [
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    token: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
    priceFeed: '0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f',
    icon: 'electric_car',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com',
    token: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
    priceFeed: '0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953',
    icon: 'shopping_cart',
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    token: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A',
    priceFeed: '0xBdC53E50b1167cE1199bFaD54A034f7ab1741051',
    icon: 'data_exploration',
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    token: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC',
    priceFeed: '0x15636CE4C0EdE55335f84E6386f8F49C897c077d',
    icon: 'memory',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    token: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
    priceFeed: '0x914c40a644493b47336de847b0404E729e06C68d',
    icon: 'memory_alt',
  },
]

export const MARKET_ABI = [
  {
    name: 'marketCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'markets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'stockToken',  type: 'address' },
      { name: 'priceFeed',   type: 'address' },
      { name: 'symbol',      type: 'string'  },
      { name: 'roundId',     type: 'uint256' },
      { name: 'openTime',    type: 'uint256' },
      { name: 'closeTime',   type: 'uint256' },
      { name: 'openPrice',   type: 'int256'  },
      { name: 'closePrice',  type: 'int256'  },
      { name: 'bullPool',    type: 'uint256' },
      { name: 'bearPool',    type: 'uint256' },
      { name: 'state',       type: 'uint8'   },
    ],
  },
  {
    name: 'bets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'address' }],
    outputs: [
      { name: 'direction', type: 'uint8'   },
      { name: 'amount',    type: 'uint256' },
      { name: 'claimed',   type: 'bool'    },
    ],
  },
  {
    name: 'placeBet',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'marketId',  type: 'uint256' },
      { name: 'direction', type: 'uint8'   },
    ],
    outputs: [],
  },
  {
    name: 'claimWinnings',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'BetPlaced',
    type: 'event',
    inputs: [
      { name: 'marketId',  type: 'uint256', indexed: true  },
      { name: 'user',      type: 'address', indexed: true  },
      { name: 'direction', type: 'uint8',   indexed: false },
      { name: 'amount',    type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'WinningsClaimed',
    type: 'event',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true  },
      { name: 'user',     type: 'address', indexed: true  },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
  },
]

export const PRICE_FEED_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId',         type: 'uint80'  },
      { name: 'answer',          type: 'int256'  },
      { name: 'startedAt',       type: 'uint256' },
      { name: 'updatedAt',       type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80'  },
    ],
  },
]

// MarketState enum
export const STATE = { OPEN: 0, LOCKED: 1, SETTLED: 2 }
// Direction enum
export const DIR = { BULL: 0, BEAR: 1 }
// FEE_BPS constant (matches contract)
export const FEE_BPS = 200n
