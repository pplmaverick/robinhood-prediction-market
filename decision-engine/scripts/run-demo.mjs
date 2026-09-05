// Runs the full Step 1+2+3 pipeline over the real 89-row PriceRangeIndex history
// (verification/decision/raw_data/price_range_index.json — same dataset already independently
// verified in verification/graph-computation/), then prints one real BULL, one real BEAR, and
// one real NO_TRADE example decision JSON.
//
// Step 3 (attestation) runs for every non-NO_TRADE decision, not just the printed examples —
// this is a real stress-test of the relayer's replay-nonce store under real sequential load
// (one nonce per triggering blockNumber), not just a cherry-picked demo of two calls.
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { runPureDecisionsOverHistory, attachAttestations } from '../src/decision-engine.js'
import { createAttestationBridge } from '../src/attestation-bridge.js'
import { NonceStore } from '../../relayer/src/nonce-store.js'
import { generatePrivateKey } from 'viem/accounts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(__dirname, '../../verification/decision/raw_data/price_range_index.json')
const OUT_PATH = join(__dirname, '../../verification/decision/raw_data/typescript_decisions.json')

const RESOURCE_URI = 'https://robinhood-stock-market.example/decision-engine/attest'
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY ?? `0x${'7b'.repeat(32)}`
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY ?? generatePrivateKey()

function jsonSafe(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

async function main() {
  const rows = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
  console.log(`Loaded ${rows.length} real PriceRangeIndex rows from ${DATA_PATH}`)

  const results = runPureDecisionsOverHistory(rows)
  const counts = { BULL: 0, BEAR: 0, NO_TRADE: 0 }
  for (const r of results) counts[r.betDecision.decision]++
  console.log('Step 1+2 decision counts over all 89 rows:', counts)
  console.log('Step 1 query-worth count:', results.filter((r) => r.queryDecision.shouldQuery).length)

  console.log(`\nRunning Step 3 (relayer attestation) for all ${counts.BULL + counts.BEAR} non-NO_TRADE decisions...`)
  const bridge = createAttestationBridge({
    agentPrivateKeyHex: AGENT_PRIVATE_KEY,
    relayerPrivateKeyHex: RELAYER_PRIVATE_KEY,
    resourceUri: RESOURCE_URI,
  })
  console.log(`Decision engine agent address: ${bridge.agentAddress}`)
  const nonceStore = new NonceStore()

  const before = Date.now()
  await attachAttestations(results, bridge, nonceStore)
  console.log(`Step 3 complete in ${((Date.now() - before) / 1000).toFixed(1)}s`)

  const statusCounts = {}
  for (const r of results) {
    const s = r.betDecision.worldIdAttestationStatus
    statusCounts[s] = (statusCounts[s] ?? 0) + 1
  }
  console.log('worldIdAttestationStatus distribution:', statusCounts)

  // Persist the full annotated run — this is also Step 4's TypeScript-side input for the
  // reference model comparison (query-decision + bet-decision only; worldIdAttestationStatus is
  // dropped there since Step 3 is out of scope for the Python mirror — see
  // verification/decision/reference_model.py).
  writeFileSync(OUT_PATH, jsonSafe(results.map((r) => r.betDecision)))
  console.log(`\nWrote full TypeScript-side decisions to ${OUT_PATH}`)

  const firstBull = results.find((r) => r.betDecision.decision === 'BULL')
  const firstBear = results.find((r) => r.betDecision.decision === 'BEAR')
  const firstNoTrade = results.find((r) => r.betDecision.decision === 'NO_TRADE')

  console.log('\n=== Example: BULL ===')
  console.log(jsonSafe(firstBull.betDecision))
  console.log('\n=== Example: BEAR ===')
  console.log(jsonSafe(firstBear.betDecision))
  console.log('\n=== Example: NO_TRADE ===')
  console.log(jsonSafe(firstNoTrade.betDecision))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
