// All thresholds here are demo-level heuristics, not backtested/optimized values -- the task
// explicitly scoped this as "make sense, not quant-grade." Every constant is named and lives
// here, not scattered as magic numbers through query-decision.js / bet-decision.js.

// --- Risk control (Step 2) ---
// Hard cap on any single bet this engine will ever propose. Pinned to the deployed contract's
// OWN documented minimum bet (see root README's "Fees & Security": "Minimum bet enforced
// (0.001 ETH)") rather than an invented figure -- this is the smallest amount the contract
// would accept at all, so it's unambiguously demo-scale by construction, not by guesswork at
// an ETH/USD conversion. Override via env for a different demo-scale value; never raise this
// to anything resembling a real position size without deliberate re-review.
const MAX_BET_SIZE_WEI = BigInt(process.env.MAX_BET_SIZE_WEI ?? '1000000000000000') // 0.001 ETH

// --- Bet decision (Step 2) ---
// percentileRank >= this = "near the top of its recent window"; <= (100 - this) = "near the
// bottom." 80/20 is the common informal "extreme decile" cutoff for this kind of heuristic --
// not derived from backtesting this specific dataset.
const PERCENTILE_HIGH_THRESHOLD = Number(process.env.PERCENTILE_HIGH_THRESHOLD ?? 80)
const PERCENTILE_LOW_THRESHOLD = Number(process.env.PERCENTILE_LOW_THRESHOLD ?? 20)

// --- Query decision (Step 1) ---
// "Anomalous" = current volatility is at least this multiple of the symbol's own trailing
// average volatility so far. 1.5x is a round, legible threshold, not fit to this dataset.
const VOLATILITY_ANOMALY_RATIO = Number(process.env.VOLATILITY_ANOMALY_RATIO ?? 1.5)

// Minimum time between two "worth querying" signals for the same symbol, regardless of how
// anomalous volatility looks in between. Matches the 5-minute window already used elsewhere in
// this codebase (AgentKit's own SIWE maxAge, and this project's Robinhood-side nonce expiry in
// relayer/src/config.js) purely for internal consistency, not because 5 minutes is derived from
// anything specific to querying cost.
const QUERY_THROTTLE_MS = Number(process.env.QUERY_THROTTLE_MS ?? 5 * 60 * 1000)

export {
  MAX_BET_SIZE_WEI,
  PERCENTILE_HIGH_THRESHOLD,
  PERCENTILE_LOW_THRESHOLD,
  VOLATILITY_ANOMALY_RATIO,
  QUERY_THROTTLE_MS,
}
