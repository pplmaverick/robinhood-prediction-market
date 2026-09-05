// Orchestrator. Two layers, deliberately kept separate:
//   - runPureDecisionsOverHistory(): Steps 1+2 only. Pure, deterministic, no network calls --
//     this is the half compared against the Python reference model (see
//     verification/decision/).
//   - attachAttestations(): Step 3. Live network calls (AgentKit signature verification's own
//     RPC check, AgentBook's RPC read). Not reference-modeled in Python, for the same reason
//     the settlement/graph-computation reference models don't reimplement RPC calls either --
//     see verification/decision/reference_model.py's docstring.
import { shouldQuery } from './query-decision.js'
import { makeBetDecision } from './bet-decision.js'

/**
 * @param {Array<object>} rows raw PriceRangeIndex rows, any order
 * @returns {Array<object>} one enriched record per row, in ascending blockNumber order, each
 *   `{ queryDecision, betDecision }` where betDecision is the Step 2 JSON shape (Step 3 fields
 *   not yet filled in)
 */
function runPureDecisionsOverHistory(rows) {
  const sorted = [...rows].sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)))

  const lastRowBySymbol = new Map()
  const volatilitySumBySymbol = new Map()
  const volatilityCountBySymbol = new Map()
  const lastQueryFlagBlockTimestampBySymbol = new Map()

  const results = []

  for (const raw of sorted) {
    const current = {
      symbol: raw.symbol,
      currentPrice: Number(raw.currentPrice),
      movingAverage: Number(raw.movingAverage),
      volatility: Number(raw.volatility),
      percentileRank: Number(raw.percentileRank),
      actualWindowSize: raw.actualWindowSize,
      isFullWindow: raw.isFullWindow,
      roundId: raw.roundId,
      blockNumber: raw.blockNumber,
      blockTimestamp: raw.blockTimestamp,
    }

    const previous = lastRowBySymbol.get(current.symbol) ?? null

    // --- Step 1: query decision, using the trailing average of volatility observed so far for
    // this symbol (BEFORE this row is folded in) and time since this symbol last flagged worth
    // querying. ---
    const volCount = volatilityCountBySymbol.get(current.symbol) ?? 0
    const volSum = volatilitySumBySymbol.get(current.symbol) ?? 0
    const historicalAvgVolatility = volCount > 0 ? volSum / volCount : null

    const lastFlagTimestamp = lastQueryFlagBlockTimestampBySymbol.get(current.symbol) ?? null
    const msSinceLastQuery =
      lastFlagTimestamp !== null ? (Number(current.blockTimestamp) - Number(lastFlagTimestamp)) * 1000 : null

    const queryDecision = shouldQuery({
      currentVolatility: current.volatility,
      historicalAvgVolatility,
      msSinceLastQuery,
    })
    if (queryDecision.shouldQuery) {
      lastQueryFlagBlockTimestampBySymbol.set(current.symbol, current.blockTimestamp)
    }

    // --- Step 2: bet decision ---
    const betDecision = makeBetDecision({ current, previous })

    results.push({ queryDecision, betDecision })

    lastRowBySymbol.set(current.symbol, current)
    volatilitySumBySymbol.set(current.symbol, volSum + current.volatility)
    volatilityCountBySymbol.set(current.symbol, volCount + 1)
  }

  return results
}

/**
 * Fills in worldIdAttestationStatus (Step 3) for every non-NO_TRADE betDecision in place, in
 * order, sharing one NonceStore and one robinhoodNonce sequence across the whole run (blockNumber
 * itself is used as the nonce -- already strictly increasing across this run's own requests, and
 * ties each attestation auditable back to the exact on-chain event that triggered it).
 *
 * @param {Array<{ betDecision: object }>} results from runPureDecisionsOverHistory
 * @param {import('./attestation-bridge.js').createAttestationBridge extends (...args: any) => infer R ? R : never} bridge
 * @param {import('../../relayer/src/nonce-store.js').NonceStore} nonceStore
 */
async function attachAttestations(results, bridge, nonceStore) {
  for (const { betDecision } of results) {
    if (betDecision.decision === 'NO_TRADE') continue

    const { worldIdAttestationStatus } = await bridge.checkAndAttest(
      {
        marketId: betDecision.marketId,
        direction: betDecision.decision === 'BULL' ? 0 : 1,
        amount: BigInt(betDecision.betAmountWei),
        robinhoodNonce: BigInt(betDecision.inputA.blockNumber),
      },
      nonceStore
    )
    betDecision.worldIdAttestationStatus = worldIdAttestationStatus
  }
  return results
}

export { runPureDecisionsOverHistory, attachAttestations }
