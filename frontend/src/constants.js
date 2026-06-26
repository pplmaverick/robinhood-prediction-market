export const MARKET_ADDRESS = '0x15636CE4C0EdE55335f84E6386f8F49C897c077d'

export const STOCKS = [
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    token: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E',
    priceFeed: '0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f',
    icon: 'electric_car',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com',
    token: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02',
    priceFeed: '0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953',
    icon: 'shopping_cart',
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    token: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0',
    priceFeed: '0xBdC53E50b1167cE1199bFaD54A034f7ab1741051',
    icon: 'data_exploration',
  },
  {
    symbol: 'NFLX',
    name: 'Netflix, Inc.',
    token: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93',
    priceFeed: '0xf6fdc6482221db4D7D285F96AdDa1914018C2642',
    icon: 'play_circle',
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    token: '0x71178BAc73cBeb415514eB542a8995b82669778d',
    priceFeed: '0xfCE76bbbdac30D17061f8Fc1f57Cd55dDa6BA40d',
    icon: 'memory',
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
