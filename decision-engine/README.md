# AI Decision Engine

Reads `PriceRangeIndex` output from the Graph computation layer (`subgraph/`) and decides
`BULL` / `BEAR` / `NO_TRADE`. For a directional decision, self-signs an AgentKit request and
submits it to the (unmodified) relayer (`relayer/`) to attach a World ID attestation status.

**Scope for this round**: produces the full decision JSON, including a verified
`worldIdAttestationStatus`. Does **not** call `placeBet()` or touch
`StockPredictionMarket.sol` — see `relayer/README.md` for the same boundary on its side.

Full factor/threshold definitions and the momentum-vs-mean-reversion disclosure are in
`docs/spec.md`, "AI Decision Engine" — read that before changing any threshold in
`src/config.js`, since `verification/decision/reference_model.py` must be kept in sync with it.

## Pipeline

1. `query-decision.js` — Step 1: is a Graph query worth issuing right now (volatility anomaly
   + throttle)? Informational only in this round; the Graph query itself already runs
   independently.
2. `bet-decision.js` — Step 2: the core decision. Produces the frozen output shape:
   `{ inputA, inputB, decision, confidence, worldIdAttestationStatus }` (plus `marketId` /
   `betAmountWei` when non-`NO_TRADE`).
3. `attestation-bridge.js` — Step 3: only called for non-`NO_TRADE` decisions. Self-signs a
   SIWE AgentKit payload and submits it to `relayer/src/relayer.js`'s `handleAgentRequest`
   unmodified, then maps the result into `backed` / `unbacked` / `unknown`.
4. `decision-engine.js` — orchestrator: `runPureDecisionsOverHistory()` (Steps 1+2, pure,
   no network) and `attachAttestations()` (Step 3, live network).

## Running

```bash
npm install
npm test        # deterministic unit tests, Steps 1+2 only
npm run demo    # full pipeline over the real 89-row PriceRangeIndex history, including live
                 # relayer attestation calls; prints one real BULL / BEAR / NO_TRADE example
```

`npm run demo` loads `.env` (via `node --env-file`), so `AGENT_PRIVATE_KEY` there is used as this
engine's fixed identity across runs. **Without a `.env`, `run-demo.mjs` generates a new random
key every single invocation** — fine for exercising the pipeline, but useless for registering a
real AgentBook identity, since a registration is permanently bound to one specific address and
there would be no way to recover that address's key on a later run. Once you intend to register
a real identity for this engine, generate a key once, save it to `.env`, and never regenerate it
— see `.env.example`.

## Reference model

`verification/decision/` independently re-implements Steps 1+2 in Python and compares it
against this package's output row-by-row on the same real historical data, SHA-256-sealed —
same methodology as `verification/settlement/` and `verification/graph-computation/`. Step 3
is out of scope there (live network calls, nothing deterministic to mirror).
