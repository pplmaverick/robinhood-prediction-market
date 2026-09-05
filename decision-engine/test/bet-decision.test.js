import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeBetDecision, classifyLevel, classifyTrend, extremityScore } from '../src/bet-decision.js'

test('classifyLevel: thresholds at 80/20 by default', () => {
  assert.equal(classifyLevel(80), 'HIGH')
  assert.equal(classifyLevel(100), 'HIGH')
  assert.equal(classifyLevel(79.9), 'NEUTRAL')
  assert.equal(classifyLevel(50), 'NEUTRAL')
  assert.equal(classifyLevel(20), 'LOW')
  assert.equal(classifyLevel(0), 'LOW')
  assert.equal(classifyLevel(20.1), 'NEUTRAL')
})

test('classifyTrend: up/down/flat/unknown', () => {
  assert.equal(classifyTrend(10, 5), 'UP')
  assert.equal(classifyTrend(5, 10), 'DOWN')
  assert.equal(classifyTrend(5, 5), 'FLAT')
  assert.equal(classifyTrend(5, null), 'UNKNOWN')
})

test('extremityScore: 0 at center, 1 at either extreme', () => {
  assert.equal(extremityScore(50), 0)
  assert.equal(extremityScore(100), 1)
  assert.equal(extremityScore(0), 1)
  assert.equal(extremityScore(80), 0.6)
  assert.equal(extremityScore(20), 0.6)
})

function row(overrides = {}) {
  return {
    symbol: 'TSLA',
    currentPrice: 100,
    movingAverage: 100,
    volatility: 1,
    percentileRank: 50,
    actualWindowSize: 5,
    isFullWindow: false,
    roundId: '1',
    blockNumber: '100',
    blockTimestamp: '1000',
    ...overrides,
  }
}

test('BULL: high percentile + rising trend', () => {
  const current = row({ percentileRank: 85, movingAverage: 110 })
  const previous = { movingAverage: 100, blockNumber: '99' }
  const result = makeBetDecision({ current, previous })
  assert.equal(result.decision, 'BULL')
  assert.equal(result.inputB.level, 'HIGH')
  assert.equal(result.inputB.trend, 'UP')
  assert.ok(result.confidence > 0)
  assert.equal(result.marketId, 0n)
  assert.equal(typeof result.betAmountWei, 'string')
})

test('BEAR: low percentile + falling trend', () => {
  const current = row({ symbol: 'NVDA', percentileRank: 15, movingAverage: 90 })
  const previous = { movingAverage: 100, blockNumber: '99' }
  const result = makeBetDecision({ current, previous })
  assert.equal(result.decision, 'BEAR')
  assert.equal(result.inputB.level, 'LOW')
  assert.equal(result.inputB.trend, 'DOWN')
  assert.ok(result.confidence > 0)
})

test('NO_TRADE: percentile extreme but trend contradicts (momentum reading, not reversion)', () => {
  const current = row({ percentileRank: 85, movingAverage: 90 }) // high but falling
  const previous = { movingAverage: 100, blockNumber: '99' }
  const result = makeBetDecision({ current, previous })
  assert.equal(result.decision, 'NO_TRADE')
  assert.equal(result.confidence, 0)
  assert.equal(result.marketId, undefined)
  assert.equal(result.betAmountWei, undefined)
})

test('NO_TRADE: percentile not extreme, even with a clear trend', () => {
  const current = row({ percentileRank: 55, movingAverage: 110 })
  const previous = { movingAverage: 100, blockNumber: '99' }
  const result = makeBetDecision({ current, previous })
  assert.equal(result.decision, 'NO_TRADE')
})

test('NO_TRADE: no previous snapshot for this symbol yet (first observation)', () => {
  const current = row({ percentileRank: 100 }) // first-ever observation always has percentileRank 100
  const result = makeBetDecision({ current, previous: null })
  assert.equal(result.decision, 'NO_TRADE')
  assert.equal(result.inputB.trend, 'UNKNOWN')
})

test('worldIdAttestationStatus defaults to not_checked and is only settable by Step 3', () => {
  const current = row({ percentileRank: 85, movingAverage: 110 })
  const previous = { movingAverage: 100, blockNumber: '99' }
  const result = makeBetDecision({ current, previous })
  assert.equal(result.worldIdAttestationStatus, 'not_checked')
})
