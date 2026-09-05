// Step 1 (low-risk layer): decides whether it's worth issuing another Graph query for a
// symbol. The query itself is already running independently (see subgraph/) -- this function
// only scores "is this worth looking at right now," not "how to query."
//
// Two factors, both required:
//   1. Volatility anomaly: current volatility is at least VOLATILITY_ANOMALY_RATIO times the
//      symbol's own trailing average volatility so far. With no trailing average yet (first
//      observation for a symbol), there is nothing to compare against -- treated as NOT
//      anomalous, not as "anomalous by default," since an unsupported claim of anomaly is worse
//      than a missed one here.
//   2. Not throttled: at least QUERY_THROTTLE_MS has passed since the last time this symbol was
//      flagged worth querying, regardless of how anomalous volatility looks in between.
import { VOLATILITY_ANOMALY_RATIO, QUERY_THROTTLE_MS } from './config.js'

/**
 * @param {object} args
 * @param {number} args.currentVolatility
 * @param {number | null} args.historicalAvgVolatility trailing average of prior observations for this symbol; null if none yet
 * @param {number | null} args.msSinceLastQuery time since this symbol was last flagged worth querying; null if never
 * @returns {{ shouldQuery: boolean, reason: string, isVolatilityAnomalous: boolean, isThrottled: boolean }}
 */
function shouldQuery({ currentVolatility, historicalAvgVolatility, msSinceLastQuery }) {
  const isVolatilityAnomalous =
    historicalAvgVolatility !== null &&
    historicalAvgVolatility > 0 &&
    currentVolatility >= VOLATILITY_ANOMALY_RATIO * historicalAvgVolatility

  const isThrottled = msSinceLastQuery !== null && msSinceLastQuery < QUERY_THROTTLE_MS

  if (!isVolatilityAnomalous) {
    return { shouldQuery: false, reason: 'volatility_not_anomalous', isVolatilityAnomalous, isThrottled }
  }
  if (isThrottled) {
    return { shouldQuery: false, reason: 'throttled', isVolatilityAnomalous, isThrottled }
  }
  return { shouldQuery: true, reason: 'volatility_anomalous_and_not_throttled', isVolatilityAnomalous, isThrottled }
}

export { shouldQuery }
