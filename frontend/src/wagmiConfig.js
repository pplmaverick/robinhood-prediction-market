import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const robinhoodTestnet = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
}

export const config = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http('https://rpc.testnet.chain.robinhood.com', {
      timeout: 30_000,
    }),
  },
  pollingInterval: 2_000,
})
