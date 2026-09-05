// Re-verified live against worldcoin/agentkit `main` on 2026-09-05 (PR #38 still
// OPEN, mergedAt: null; npm @worldcoin/agentkit-core still 0.2.1) — see
// RESEARCH_NOTES_x402_agentkit_0903.md. If a future session finds PR #38 merged,
// every constant and interface assumption in this directory needs re-checking
// before reuse, not just this file.

const AGENT_BOOK_ADDRESS = '0xA23aB2712eA7BBa896930544C7d6636a96b944dA'
const WORLD_CHAIN_ID = 480

// AgentKit's own SIWE message max-age (separate from this relayer's own nonce
// expiry below — two different clocks for two different replay spaces).
const AGENTKIT_MAX_AGE_MS = 5 * 60 * 1000

// Robinhood-side attestation replay window. Deliberately its own constant, not
// reused from AGENTKIT_MAX_AGE_MS: this guards a different nonce space
// (relayer-issued robinhoodNonce, not AgentKit's SIWE message nonce).
const ROBINHOOD_NONCE_MAX_AGE_MS = 5 * 60 * 1000

export { AGENT_BOOK_ADDRESS, WORLD_CHAIN_ID, AGENTKIT_MAX_AGE_MS, ROBINHOOD_NONCE_MAX_AGE_MS }
