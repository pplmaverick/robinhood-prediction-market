// Step 2 (high-risk layer, the core of this engine): BULL / BEAR / NO_TRADE.
//
// Signal direction is momentum/continuation, not mean-reversion -- a deliberate choice among
// several reasonable ones, not a claim that this is the correct trading strategy. See
// docs/spec.md, "Decision engine signal direction" for the full disclosure of why.
//
// Two factors:
//   - level:     percentileRank vs its window (HIGH near top / LOW near bottom / NEUTRAL)
//   - direction: movingAverage vs the immediately preceding snapshot for the same symbol
//                (UP / DOWN / FLAT / UNKNOWN if there is no preceding snapshot yet)
// Consistency gate: HIGH+UP -> BULL, LOW+DOWN -> BEAR. Any other combination (level not
// extreme, no trend data yet, or level and direction disagreeing) -> NO_TRADE. "Disagreeing"
// here is intentionally NOT flipped into the opposite decision (that would be the
// mean-reversion reading this engine explicitly did not choose) -- it is treated as an
// unclear/contradictory signal, per the task's own framing ("訊號矛盾或不明確時選 NO_TRADE").
import { PERCENTILE_HIGH_THRESHOLD, PERCENTILE_LOW_THRESHOLD, MAX_BET_SIZE_WEI } from './config.js'

const SYMBOL_MARKET_ID = { TSLA: 0n, AMZN: 1n, PLTR: 2n, AMD: 3n, NVDA: 4n }

function classifyLevel(percentileRank) {
  if (percentileRank >= PERCENTILE_HIGH_THRESHOLD) return 'HIGH'
  if (percentileRank <= PERCENTILE_LOW_THRESHOLD) return 'LOW'
  return 'NEUTRAL'
}

function classifyTrend(currentMovingAverage, previousMovingAverage) {
  if (previousMovingAverage === null) return 'UNKNOWN'
  if (currentMovingAverage > previousMovingAverage) return 'UP'
  if (currentMovingAverage < previousMovingAverage) return 'DOWN'
  return 'FLAT'
}

// 0 at percentileRank=50 (no signal), 1 at percentileRank=0 or 100 (maximally extreme).
// Reported as 0 whenever the decision is NO_TRADE, by design (see module docstring) -- a
// "confident but not acted on" number would read as contradictory on a demo screen.
function extremityScore(percentileRank) {
  return Math.min(1, Math.abs(percentileRank - 50) / 50)
}

/**
 * @param {object} args
 * @param {{ symbol: string, currentPrice: number, movingAverage: number, volatility: number, percentileRank: number, actualWindowSize: number, isFullWindow: boolean, roundId: string, blockNumber: string, blockTimestamp: string }} args.current one PriceRangeIndex row
 * @param {{ movingAverage: number, blockNumber: string } | null} args.previous the immediately preceding PriceRangeIndex row for the SAME symbol, or null if this is the first observation for that symbol
 * @returns {object} the decision JSON (worldIdAttestationStatus defaults to 'not_checked'; Step 3 fills it in for non-NO_TRADE decisions)
 */
function makeBetDecision({ current, previous }) {
  const level = classifyLevel(current.percentileRank)
  const trend = classifyTrend(current.movingAverage, previous ? previous.movingAverage : null)

  let decision = 'NO_TRADE'
  if (level === 'HIGH' && trend === 'UP') decision = 'BULL'
  else if (level === 'LOW' && trend === 'DOWN') decision = 'BEAR'

  const confidence = decision === 'NO_TRADE' ? 0 : extremityScore(current.percentileRank)

  const inputA = {
    symbol: current.symbol,
    currentPrice: current.currentPrice,
    movingAverage: current.movingAverage,
    volatility: current.volatility,
    percentileRank: current.percentileRank,
    actualWindowSize: current.actualWindowSize,
    isFullWindow: current.isFullWindow,
    roundId: current.roundId,
    blockNumber: current.blockNumber,
    blockTimestamp: current.blockTimestamp,
  }

  const inputB = {
    level,
    trend,
    previousMovingAverage: previous ? previous.movingAverage : null,
    previousBlockNumber: previous ? previous.blockNumber : null,
    consistent: decision !== 'NO_TRADE',
  }

  const result = {
    inputA,
    inputB,
    decision,
    confidence,
    worldIdAttestationStatus: 'not_checked',
  }

  if (decision !== 'NO_TRADE') {
    result.marketId = SYMBOL_MARKET_ID[current.symbol] ?? null // demo placeholder -- no live open-market lookup; see decision-engine/README.md
    result.betAmountWei = MAX_BET_SIZE_WEI.toString()
  }

  return result
}

export { makeBetDecision, classifyLevel, classifyTrend, extremityScore, SYMBOL_MARKET_ID }
