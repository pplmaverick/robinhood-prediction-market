import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NonceStore } from '../src/nonce-store.js'

const ADDR = '0x000000000000000000000000000000000000dead'

test('first use of a nonce is accepted', () => {
  const store = new NonceStore()
  const result = store.tryConsume(ADDR, 1n, Date.now())
  assert.equal(result.ok, true)
})

test('exact replay of the same nonce is rejected', () => {
  const store = new NonceStore()
  assert.equal(store.tryConsume(ADDR, 1n, Date.now()).ok, true)

  const replay = store.tryConsume(ADDR, 1n, Date.now())
  assert.equal(replay.ok, false)
  assert.equal(replay.reason, 'replay')
})

test('an older, out-of-order nonce is rejected even though it was never literally seen before', () => {
  const store = new NonceStore()
  assert.equal(store.tryConsume(ADDR, 5n, Date.now()).ok, true)

  const outOfOrder = store.tryConsume(ADDR, 3n, Date.now())
  assert.equal(outOfOrder.ok, false)
  assert.equal(outOfOrder.reason, 'replay')
})

test('a strictly increasing nonce from the same address is accepted', () => {
  const store = new NonceStore()
  assert.equal(store.tryConsume(ADDR, 1n, Date.now()).ok, true)
  assert.equal(store.tryConsume(ADDR, 2n, Date.now()).ok, true)
  assert.equal(store.tryConsume(ADDR, 3n, Date.now()).ok, true)
})

test('nonce spaces are independent per address', () => {
  const store = new NonceStore()
  const addrB = '0x000000000000000000000000000000000000beef'
  assert.equal(store.tryConsume(ADDR, 1n, Date.now()).ok, true)
  // addrB has never used nonce 1 before — must be accepted despite ADDR having used it.
  assert.equal(store.tryConsume(addrB, 1n, Date.now()).ok, true)
})

test('a request older than the max age is rejected as stale, independent of nonce', () => {
  const store = new NonceStore({ maxAgeMs: 1000 })
  const tenSecondsAgo = Date.now() - 10_000
  const result = store.tryConsume(ADDR, 1n, tenSecondsAgo)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'stale')
})

test('a request timestamped in the future is rejected', () => {
  const store = new NonceStore()
  const inTheFuture = Date.now() + 60_000
  const result = store.tryConsume(ADDR, 1n, inTheFuture)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'future')
})
