// Step 3 deliverable: prove a replayed attestation request is rejected on the second submission.
//
// AgentKit signature verification and the AgentBook RPC call are both mocked here — those two
// integrations are already proven against live services elsewhere (Step 0 re-verified `main`'s
// interface directly from source; Step 1 confirmed the AgentBook contract live on World Chain
// via `cast call`). What this test isolates and proves is the piece this relayer is actually
// responsible for building: that submitting the identical signed agent request twice is
// rejected the second time, and specifically because of replay — not because of some other
// unrelated failure that would happen to also return ok:false.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleAgentRequest } from '../src/relayer.js'
import { NonceStore } from '../src/nonce-store.js'
import { recoverSignerAddress, deriveAddressFromPrivateKey } from '../src/attestation.js'

const AGENT_ADDRESS = '0x000000000000000000000000000000000000a9e7'
const RELAYER_PRIVATE_KEY = `0x${'42'.repeat(32)}`

function jsonWithBigInt(value) {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
}

function fakeVerifiedAgentRequest() {
  // Stands in for a real AgentKit-verified signature: same shape (`{ ok, address }`) that
  // verify-signature.js's verifyAgentRequest returns once signature + domain/URI/timestamp
  // checks pass. Deterministic, so both calls in this test "verify" identically — which is the
  // realistic scenario a replay attack exploits: the attacker resubmits a payload that verifies
  // completely fine every time; only the nonce store is what has to stop it.
  return async () => ({ ok: true, address: AGENT_ADDRESS })
}

function fakeBackedHuman() {
  return async () => ({ status: 'backed', humanId: '777', source: 'mock' })
}

function buildRequest(overrides = {}) {
  const now = BigInt(Date.now())
  return {
    agentkitPayload: {}, // irrelevant — verifyAgentRequest is mocked
    expectedResourceUri: 'https://robinhood-stock-market.example/relayer/attest',
    request: {
      marketId: 3n,
      direction: 0,
      amount: 1_000_000_000_000_000n,
      robinhoodNonce: 1n,
      issuedAt: now,
      expiresAt: now + 300_000n,
      ...overrides,
    },
    nonceStore: overrides.nonceStore,
    relayerPrivateKeyHex: RELAYER_PRIVATE_KEY,
  }
}

test('replay attack: submitting the same signed attestation twice — second attempt is rejected', async () => {
  const nonceStore = new NonceStore()
  const deps = { verifyAgentRequest: fakeVerifiedAgentRequest(), lookupHumanBacking: fakeBackedHuman() }

  const firstArgs = buildRequest({ nonceStore })
  const first = await handleAgentRequest(firstArgs, deps)

  assert.equal(first.ok, true, `first submission should succeed, got: ${jsonWithBigInt(first)}`)
  assert.equal(first.attestation.agentAddress, AGENT_ADDRESS)

  const relayerAddress = deriveAddressFromPrivateKey(RELAYER_PRIVATE_KEY)
  const recovered = recoverSignerAddress(first.hash, first.signature.r, first.signature.s, first.signature.v)
  assert.equal(
    recovered.toLowerCase(),
    relayerAddress.toLowerCase(),
    'attestation signature must recover to the relayer address — proves this is a real signature, not a stub'
  )

  // The exact same signed request, submitted again — this is the replay.
  const secondArgs = buildRequest({ nonceStore, robinhoodNonce: firstArgs.request.robinhoodNonce })
  const second = await handleAgentRequest(secondArgs, deps)

  assert.equal(second.ok, false, 'second submission of the same attestation must be rejected')
  assert.equal(second.reason, 'replay_replay', `expected a replay-specific rejection reason, got: ${second.reason}`)
})

test('a strictly higher robinhoodNonce from the same agent after a prior success is still accepted (not a blanket lockout)', async () => {
  const nonceStore = new NonceStore()
  const deps = { verifyAgentRequest: fakeVerifiedAgentRequest(), lookupHumanBacking: fakeBackedHuman() }

  const first = await handleAgentRequest(buildRequest({ nonceStore, robinhoodNonce: 1n }), deps)
  assert.equal(first.ok, true)

  const second = await handleAgentRequest(buildRequest({ nonceStore, robinhoodNonce: 2n }), deps)
  assert.equal(second.ok, true, 'a genuinely new request (higher nonce) must not be collaterally rejected')
})

test('AgentBook RPC failure is reported distinctly from "not backed" — never collapsed into a false accusation', async () => {
  const nonceStore = new NonceStore()
  const deps = {
    verifyAgentRequest: fakeVerifiedAgentRequest(),
    lookupHumanBacking: async () => ({ status: 'unknown', error: 'ETIMEDOUT', source: 'mock' }),
  }

  const result = await handleAgentRequest(buildRequest({ nonceStore }), deps)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'agent_book_unreachable')
  assert.notEqual(result.reason, 'agent_not_human_backed')
})

test('a genuinely unregistered agent is rejected distinctly from an RPC failure', async () => {
  const nonceStore = new NonceStore()
  const deps = {
    verifyAgentRequest: fakeVerifiedAgentRequest(),
    lookupHumanBacking: async () => ({ status: 'unbacked', source: 'mock' }),
  }

  const result = await handleAgentRequest(buildRequest({ nonceStore }), deps)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'agent_not_human_backed')
})
