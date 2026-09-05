import { ROBINHOOD_NONCE_MAX_AGE_MS } from './config.js'

// AgentKit upstream has no nonce mechanism on either interface as of this session's
// re-verification (2026-09-05): PR #42, which would have added `tryRecordNonce` on top
// of the RFC 9421 signature format, is closed and unmerged, and the current `main`
// interface (`validateAgentkitMessage`'s `checkNonce`) is only an optional caller-supplied
// callback — AgentKit itself never generates or persists a nonce. This store is the
// Robinhood-side replacement, in its own namespace, keyed by the *verified* agent address
// (never trust an address the caller merely asserts).
//
// "Strictly increasing" here means: a request is only accepted if its nonce is greater
// than the highest nonce this store has already accepted for that address. Re-submitting
// the same nonce (a literal replay) or an older one (out-of-order replay) are both
// rejected by the same check.

class NonceStore {
  constructor({ maxAgeMs = ROBINHOOD_NONCE_MAX_AGE_MS } = {}) {
    this._maxAgeMs = maxAgeMs
    this._lastNonceByAddress = new Map()
  }

  /**
   * Atomic check-and-record: no `await` between reading the last-seen nonce and
   * writing the new one, so two calls for the same address can't both observe the
   * pre-update state (the TOCTOU race PR #36 targets upstream, avoided here by
   * keeping this function synchronous).
   *
   * @param {string} agentAddress verified signer address, lowercased by caller convention
   * @param {bigint} nonce strictly increasing per-address counter supplied by the agent
   * @param {number} issuedAtMs Unix ms timestamp the request claims to have been issued at
   * @returns {{ ok: true } | { ok: false, reason: 'replay' | 'stale' | 'future' }}
   */
  tryConsume(agentAddress, nonce, issuedAtMs) {
    const key = agentAddress.toLowerCase()
    const now = Date.now()

    const age = now - issuedAtMs
    if (age > this._maxAgeMs) return { ok: false, reason: 'stale' }
    if (age < 0) return { ok: false, reason: 'future' }

    const lastNonce = this._lastNonceByAddress.get(key)
    if (lastNonce !== undefined && nonce <= lastNonce) {
      return { ok: false, reason: 'replay' }
    }

    this._lastNonceByAddress.set(key, nonce)
    return { ok: true }
  }

  /** Test/debug helper only — not part of the trust boundary. */
  _peekLastNonce(agentAddress) {
    return this._lastNonceByAddress.get(agentAddress.toLowerCase())
  }
}

export { NonceStore }
