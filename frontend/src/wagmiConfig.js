import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const robinhoodMainnet = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
}

export const config = createConfig({
  chains: [robinhoodMainnet],
  connectors: [injected()],
  transports: {
    [robinhoodMainnet.id]: http('https://rpc.mainnet.chain.robinhood.com', {
      timeout: 30_000,
    }),
  },
  pollingInterval: 2_000,
})
