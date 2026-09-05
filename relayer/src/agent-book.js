import { createPublicClient, http } from 'viem'
import { worldchain } from 'viem/chains'
import { AGENT_BOOK_ADDRESS, WORLD_CHAIN_ID } from './config.js'

// Deliberately NOT using @worldcoin/agentkit-core's createAgentBookVerifier().lookupHuman() —
// read core/src/agent-book.ts on `main` (re-fetched 2026-09-05) and confirmed it catches
// *every* error (RPC timeout, bad response, network down) and returns the same `null` it
// returns for a genuinely unregistered address (humanId === 0n). A network blip would read
// as "this agent has no human behind it."
//
// This mirrors the fix documented in poh-aggregator (andrevalenm/poh-aggregator,
// apps/agent/src/world/agentbook.js#L63-L82, commit a26488a):
// https://github.com/andrevalenm/poh-aggregator/blob/a26488ac8e3a4ed02068d3693856358b81e7e2fd/apps/agent/src/world/agentbook.js#L63-L82
// Same ABI, same contract address, same three-state shape — we just call readContract()
// ourselves instead of going through AgentKit's boolean/null-collapsing wrapper.

const AGENT_BOOK_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'lookupHuman',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]

function createAgentBookClient(rpcUrl) {
  return createPublicClient({
    chain: worldchain.id === WORLD_CHAIN_ID ? worldchain : { id: WORLD_CHAIN_ID },
    transport: http(rpcUrl),
  })
}

/**
 * @param {string} agentAddress
 * @param {{ client?: import('viem').PublicClient, contractAddress?: `0x${string}`, rpcUrl?: string }} [options]
 * @returns {Promise<
 *   | { status: 'backed', humanId: string, source: string }
 *   | { status: 'unbacked', source: string }
 *   | { status: 'unknown', error: string, source: string }
 * >}
 */
async function lookupHumanBacking(agentAddress, options = {}) {
  const contractAddress = options.contractAddress ?? AGENT_BOOK_ADDRESS
  const client = options.client ?? createAgentBookClient(options.rpcUrl)
  const source = `AgentBook.lookupHuman() on World Chain (${contractAddress})`

  try {
    const humanId = await client.readContract({
      address: contractAddress,
      abi: AGENT_BOOK_ABI,
      functionName: 'lookupHuman',
      args: [agentAddress],
    })

    if (humanId === 0n) return { status: 'unbacked', source }
    return { status: 'backed', humanId: humanId.toString(), source }
  } catch (e) {
    // Deliberately not 'unbacked'. A failure to ask is not a negative answer.
    return { status: 'unknown', error: e instanceof Error ? e.message : String(e), source }
  }
}

export { lookupHumanBacking, createAgentBookClient, AGENT_BOOK_ABI }
