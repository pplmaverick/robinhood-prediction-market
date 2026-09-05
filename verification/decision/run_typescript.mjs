// Runs ONLY the pure, deterministic Step 1+2 logic (decision-engine/src/{query-decision,
// bet-decision}.js via decision-engine.js) over the real 89-row PriceRangeIndex history and
// dumps both the query-decision and bet-decision outputs for compare.py.
//
// Step 3 (relayer attestation) is deliberately not run here — it makes live network calls
// (AgentKit signature verification's own RPC check, AgentBook's RPC read), so it isn't something
// a Python reference model can meaningfully reproduce or be compared against. This mirrors why
// verification/settlement/reference_model.py and verification/graph-computation/reference_model.py
// don't reimplement RPC calls either — they reference-model the deterministic computation only.
// decision-engine/scripts/run-demo.mjs is where Step 3 actually runs, against the real relayer.
import { readFileSync, writeFileSync } from 'fs'
import { runPureDecisionsOverHistory } from '../../decision-engine/src/decision-engine.js'

const rows = JSON.parse(readFileSync('raw_data/price_range_index.json', 'utf8'))
const results = runPureDecisionsOverHistory(rows)

const output = results.map((r) => ({
  blockNumber: r.betDecision.inputA.blockNumber,
  symbol: r.betDecision.inputA.symbol,
  shouldQuery: r.queryDecision.shouldQuery,
  queryReason: r.queryDecision.reason,
  decision: r.betDecision.decision,
  confidence: r.betDecision.confidence,
  level: r.betDecision.inputB.level,
  trend: r.betDecision.inputB.trend,
}))

writeFileSync('raw_data/typescript_pure_decisions.json', JSON.stringify(output, null, 2))
console.log(`Wrote ${output.length} rows to raw_data/typescript_pure_decisions.json`)
