// Trusted-signer relayer for World AgentKit human-verification, bridging into Robinhood Chain.
// Scope for this round, per explicit instruction: this module verifies an agent's request and
// produces a signed attestation. It does NOT call placeBet() or touch StockPredictionMarket.sol —
// consuming the attestation on-chain is a separate, not-yet-built piece of work.
//
// Pipeline, in order, and why the order matters:
//   1. verifyAgentRequest    — AgentKit SIWE signature + domain/URI/timestamp checks. Must run
//                              first: every later step trusts `address`, and that trust is only
//                              earned once the signature over it has been verified.
//   2. lookupHumanBacking    — AgentBook three-state check on the *verified* address (never an
//                              address the caller merely asserts in an unverified field).
//   3. nonceStore.tryConsume — Robinhood-side replay/staleness check, independent nonce space
//                              from AgentKit's own SIWE nonce.
//   4. buildAttestationHash + signRawHash — only after all three gates pass.
import { getAddress } from 'viem'
import { verifyAgentRequest } from './verify-signature.js'
import { lookupHumanBacking } from './agent-book.js'
import { buildAttestationHash, signRawHash } from './attestation.js'

/**
 * @param {object} args
 * @param {import('@worldcoin/agentkit-core').AgentkitPayload} args.agentkitPayload
 * @param {string} args.expectedResourceUri
 * @param {{ marketId: bigint, direction: number, amount: bigint, robinhoodNonce: bigint, issuedAt: bigint, expiresAt: bigint }} args.request
 * @param {import('./nonce-store.js').NonceStore} args.nonceStore
 * @param {`0x${string}`} args.relayerPrivateKeyHex
 * @param {{ lookupHumanBacking?: typeof lookupHumanBacking, verifyAgentRequest?: typeof verifyAgentRequest }} [deps] injection point for tests
 * @returns {Promise<
 *   | { ok: true, attestation: object, signature: { r: string, s: string, v: number, signature: string } }
 *   | { ok: false, reason: string, error?: string }
 * >}
 */
async function handleAgentRequest(args, deps = {}) {
  const doLookupHumanBacking = deps.lookupHumanBacking ?? lookupHumanBacking
  const doVerifyAgentRequest = deps.verifyAgentRequest ?? verifyAgentRequest

  const verification = await doVerifyAgentRequest(args.agentkitPayload, args.expectedResourceUri)
  if (!verification.ok) {
    return { ok: false, reason: verification.reason, error: verification.error }
  }
  const agentAddress = getAddress(verification.address)

  const backing = await doLookupHumanBacking(agentAddress)
  if (backing.status === 'unbacked') {
    return { ok: false, reason: 'agent_not_human_backed', error: `${agentAddress} has no registered humanId in AgentBook` }
  }
  if (backing.status === 'unknown') {
    // Distinct error from 'unbacked' on purpose (Step 2): an RPC failure must never be
    // reported to the caller as "you aren't verified" — that's a false accusation the caller
    // can't even investigate. Callers/operators should treat this as "retry later", not "denied".
    console.error(`[relayer] AgentBook lookup UNKNOWN for ${agentAddress}: ${backing.error} (source: ${backing.source})`)
    return { ok: false, reason: 'agent_book_unreachable', error: backing.error }
  }

  const nonceResult = args.nonceStore.tryConsume(agentAddress, args.request.robinhoodNonce, Number(args.request.issuedAt))
  if (!nonceResult.ok) {
    return { ok: false, reason: `replay_${nonceResult.reason}` }
  }

  const attestation = {
    agentAddress,
    humanId: BigInt(backing.humanId),
    marketId: args.request.marketId,
    direction: args.request.direction,
    amount: args.request.amount,
    robinhoodNonce: args.request.robinhoodNonce,
    issuedAt: args.request.issuedAt,
    expiresAt: args.request.expiresAt,
  }

  const hash = buildAttestationHash(attestation)
  const signature = signRawHash(hash, args.relayerPrivateKeyHex)

  return { ok: true, attestation, hash, signature }
}

export { handleAgentRequest }
