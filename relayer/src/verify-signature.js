// Thin wrapper over @worldcoin/agentkit-core's *unmodified* verification interface.
// Re-confirmed live against `main` on 2026-09-05 (PR #38 still OPEN — see config.js):
// `verifyAgentkitSignature(payload, options)` only checks the SIWE-reconstructed signature
// (EOA ecrecover / ERC-1271 / ERC-6492 via viem); it never touches AgentBook. Separately,
// `validateAgentkitMessage(message, expectedResourceUri, { maxAge, checkNonce })` checks
// domain/URI/timestamp bounds and an optional caller-supplied nonce callback. Neither call
// does the "look up the verified address in AgentBook" step — that's this relayer's own job
// (see agent-book.js), and it must run *after* signature verification succeeds, keyed off the
// address that verification actually returned, never off an address the caller merely claims.
import { verifyAgentkitSignature, validateAgentkitMessage } from '@worldcoin/agentkit-core'
import { AGENTKIT_MAX_AGE_MS } from './config.js'

/**
 * @param {import('@worldcoin/agentkit-core').AgentkitPayload} payload
 * @param {string} expectedResourceUri
 * @returns {Promise<{ ok: true, address: string } | { ok: false, reason: 'signature_invalid' | 'message_invalid', error: string }>}
 */
async function verifyAgentRequest(payload, expectedResourceUri) {
  const sigResult = await verifyAgentkitSignature(payload)
  if (!sigResult.valid) {
    return { ok: false, reason: 'signature_invalid', error: sigResult.error }
  }

  const messageResult = await validateAgentkitMessage(payload, expectedResourceUri, {
    maxAge: AGENTKIT_MAX_AGE_MS,
  })
  if (!messageResult.valid) {
    return { ok: false, reason: 'message_invalid', error: messageResult.error }
  }

  return { ok: true, address: sigResult.address }
}

export { verifyAgentRequest }
