// Step 3: when the bet decision is non-NO_TRADE, this engine acts as its own AgentKit "agent" --
// it self-signs a SIWE-format AgentKit request with its own wallet key and submits it to the
// (unmodified) relayer, exactly as any external agent would. This exercises the real relayer
// pipeline (verify signature -> AgentBook three-state check -> nonce -> sign attestation), not a
// shortcut that calls AgentBook directly and skips the signature layer.
//
// Scope boundary (unchanged from the relayer's own): this only produces and verifies an
// attestation. It never calls placeBet() and never touches StockPredictionMarket.sol.
import { privateKeyToAccount } from 'viem/accounts'
import { formatSIWEMessage } from '@worldcoin/agentkit-core'
import { handleAgentRequest } from '../../relayer/src/relayer.js'

/**
 * @param {object} args
 * @param {`0x${string}`} args.agentPrivateKeyHex this engine's own signing key -- the "agent" AgentBook checks
 * @param {`0x${string}`} args.relayerPrivateKeyHex
 * @param {string} args.resourceUri
 */
function createAttestationBridge({ agentPrivateKeyHex, relayerPrivateKeyHex, resourceUri }) {
  const account = privateKeyToAccount(agentPrivateKeyHex)

  /**
   * @param {{ marketId: bigint, direction: number, amount: bigint, robinhoodNonce: bigint }} betRequest
   * @param {import('../../relayer/src/nonce-store.js').NonceStore} nonceStore
   * @returns {Promise<{ worldIdAttestationStatus: 'backed' | 'unbacked' | 'unknown', detail: object }>}
   */
  async function checkAndAttest(betRequest, nonceStore) {
    const domain = new URL(resourceUri).hostname
    const now = new Date()
    const payloadInfo = {
      domain,
      uri: resourceUri,
      statement: 'Robinhood Stock Market decision engine — bet attestation request',
      version: '1',
      chainId: 'eip155:8453', // Base — see relayer/scripts/live-e2e-demo.mjs for why this chain
      type: 'eip191',
      nonce: `${betRequest.robinhoodNonce}`,
      issuedAt: now.toISOString(),
    }
    const message = formatSIWEMessage(payloadInfo, account.address)
    const signature = await account.signMessage({ message })
    const agentkitPayload = { ...payloadInfo, address: account.address, signature }

    const issuedAt = BigInt(Date.now())
    const result = await handleAgentRequest(
      {
        agentkitPayload,
        expectedResourceUri: resourceUri,
        request: { ...betRequest, issuedAt, expiresAt: issuedAt + 300_000n },
        nonceStore,
        relayerPrivateKeyHex,
      },
      {}
    )

    if (result.ok) {
      return { worldIdAttestationStatus: 'backed', detail: result }
    }
    if (result.reason === 'agent_not_human_backed') {
      return { worldIdAttestationStatus: 'unbacked', detail: result }
    }
    if (result.reason === 'agent_book_unreachable') {
      return { worldIdAttestationStatus: 'unknown', detail: result }
    }
    // Any other failure (signature_invalid, message_invalid, replay_*) is not actually an
    // AgentBook state at all -- it means something upstream of AgentBook went wrong (e.g. this
    // engine's own nonce bookkeeping). Never report that as 'unbacked': that would be a false
    // accusation against an agent that may well be genuinely backed. 'unknown' is the honest,
    // conservative label — same principle as the three-state AgentBook read itself.
    console.error(`[decision-engine] attestation request failed upstream of AgentBook: ${result.reason} ${result.error ?? ''}`)
    return { worldIdAttestationStatus: 'unknown', detail: result }
  }

  return { checkAndAttest, agentAddress: account.address }
}

export { createAttestationBridge }
