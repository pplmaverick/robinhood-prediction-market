import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldQuery } from '../src/query-decision.js'

test('no baseline yet -> not anomalous, do not query', () => {
  const result = shouldQuery({ currentVolatility: 100, historicalAvgVolatility: null, msSinceLastQuery: null })
  assert.equal(result.shouldQuery, false)
  assert.equal(result.reason, 'volatility_not_anomalous')
})

test('volatility well within normal range -> do not query', () => {
  const result = shouldQuery({ currentVolatility: 1.0, historicalAvgVolatility: 1.0, msSinceLastQuery: null })
  assert.equal(result.shouldQuery, false)
})

test('volatility spikes above the anomaly ratio and not throttled -> query', () => {
  const result = shouldQuery({ currentVolatility: 2.0, historicalAvgVolatility: 1.0, msSinceLastQuery: null })
  assert.equal(result.shouldQuery, true)
  assert.equal(result.isVolatilityAnomalous, true)
})

test('volatility spikes but symbol was queried very recently -> throttled', () => {
  const result = shouldQuery({ currentVolatility: 2.0, historicalAvgVolatility: 1.0, msSinceLastQuery: 1000 })
  assert.equal(result.shouldQuery, false)
  assert.equal(result.reason, 'throttled')
})

test('volatility spikes and throttle window has fully elapsed -> query', () => {
  const result = shouldQuery({ currentVolatility: 2.0, historicalAvgVolatility: 1.0, msSinceLastQuery: 10 * 60 * 1000 })
  assert.equal(result.shouldQuery, true)
})
