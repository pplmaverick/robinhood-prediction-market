# Genesis Round Decimals Anomaly — Spec

## Disclosure text (for submission form use)

> During our SDK investigation, we discovered that genesis-era Chainlink
> rounds on Robinhood Chain's tokenized equity feeds exhibit decimals
> inconsistencies inherited from feed initialization. To our knowledge,
> this edge case is undocumented. Our reference model
> (`verification/settlement/`) explicitly excludes these rounds from
> historical volatility calculations, and our planned Graph indexing layer
> will apply the same exclusion rule, to prevent data corruption in the
> AI Agent's decision inputs.

*(Reworded from the original draft: the original said "we explicitly
exclude these rounds ... in our Graph indexing layer" in the present
tense. The Graph indexing layer doesn't exist in this repo yet — it's
explicitly out-of-scope, Day 1+ work — so stating it in the present tense
would misdescribe something not yet built as already running. If you want
the present-tense framing for pitch purposes instead, say so and I'll
revert it — but factually, right now, only the reference model exclusion
is real.)*

## Technical findings

All figures below were independently re-derived this session by calling
`getRoundData(roundId)` directly against each feed's underlying raw
aggregator (reached by calling `.aggregator()` on the proxy address listed
in `verification/settlement/comparison_report.md` — the proxy itself
reverts on plain, non-phase-packed round IDs, which is why an initial
naive check appeared to fail before the proxy layer was accounted for).
Every timestamp below matches the independently-computed value to the
second.

- All 5 feeds' genesis round (`round 1`) share the same `startedAt`,
  essentially exactly: TSLA, AMZN, AMD, and NVDA are all `1782086431`
  (2026-06-22 00:00:31 UTC); PLTR is one second earlier, `1782086430`
  (2026-06-22 00:00:30 UTC). Not literally bit-identical across all five,
  but consistent with one shared genesis/seed event, not five independent
  initializations.
- Each feed transitioned to normal `decimals()=8`-scaled pricing within a
  ~6-minute window (2026-06-23 13:51–13:58 UTC) — consistent with a single,
  synchronized batch reconfiguration event across all 5 aggregators, not
  independent gradual adjustments per feed. This occurred ~37.9 hours after
  the shared genesis moment and ~7.4 days before Robinhood Chain's mainnet
  launch (2026-07-01, per this repo's own README).
- Per-feed anomalous round cutoffs are **not uniform** — do not use a
  single "exclude round #1" threshold. Confirmed cutoffs (verified live
  on-chain, this session):

  | Symbol | Last anomalous round | First normal round | First normal round `updatedAt` (UTC) |
  |---|---|---|---|
  | TSLA | 37 | **38** | 2026-06-23 13:52:16 |
  | AMZN | 26 | **27** | 2026-06-23 13:53:11 |
  | PLTR | 50 | **51** | 2026-06-23 13:51:23 |
  | AMD  | 85 | **86** | 2026-06-23 13:57:40 |
  | NVDA | 24 | **25** | 2026-06-23 13:52:29 |

- Anomalous rounds store the same underlying real-world price, but scaled
  as if at 18 decimals (Wei-style) rather than the `decimals()`-reported 8
  — e.g. TSLA round 37's raw `answer` is `3,884,600,000,000,000,000`, which
  divided by `1e16` (not `1e8`) recovers `$388.46`, closely matching round
  38's correctly-scaled `$388.93`. The anomalous/normal magnitude ratio is
  ~10^8, consistent across feeds.
- Cross-referenced against the 27 real `settleMarket()` transactions
  (commit `da13c80`): none touched an anomalous round. The latest anomalous
  round across all 5 feeds ends by 2026-06-23 13:57:40 UTC (AMD); the
  earliest real settlement is 2026-07-03 11:17:55 UTC (market 0, TSLA) —
  roughly a 9.9-day buffer. This is not a close call.
- **Total: 222 anomalous rounds across all 5 feeds** (TSLA 37 + AMZN 26 +
  PLTR 50 + AMD 85 + NVDA 24 = 222), counting rounds 1 through the "last
  anomalous round" value in the table above, inclusive, for each feed.
  **Verified 2026-09-05**: re-queried `getRoundData()` for each feed's exact
  cutoff pair (last-anomalous / first-normal round) directly against the
  live mainnet RPC; all 10 values match this table exactly, no change from
  the original 2026-09-03 derivation. Genesis rounds are immutable
  historical data, so this was expected barring a feed redeployment — none
  occurred.

## RPC `eth_getLogs` range strategy (2026-09-05 spike)

Robinhood Chain mainnet (`rpc.mainnet.chain.robinhood.com`) has **no hard
block-range cap** on `eth_getLogs` — unlike Arc Testnet's documented 10K-block
limit, a single request spanning the entire chain history (~54.68M blocks)
was accepted without a "range too large"-style rejection. However, large
full-history queries are **not reliably successful**: querying 3 of 5
Chainlink raw aggregators across their full history returned
`{"code":-32000,"message":"log query timed out"}` on repeated, spaced-out
retries (not a rate-limit fluke); 2 of 5 succeeded. Reducing to a
20,000,000-block window succeeded for all 5 feeds tested. A separate,
independent failure mode — `{"code":429,"message":"Too Many Requests"}` —
appeared under rapid back-to-back requests and disappeared with a delay.

**Adopted design**: chunk `eth_getLogs` queries into 10–20 million block
windows; apply retry/backoff to both `-32000` (timeout) and `429`
(rate-limit) errors; do not assume a single full-history query will
succeed. Apply this wherever a subgraph indexing script or the relayer
uses `eth_getLogs` against this RPC endpoint.

## Indexing infrastructure: two paths validated in parallel (2026-09-05)

Before committing to an indexing approach for the rolling-window
computation layer, both available paths were spiked concurrently rather
than picking one and hoping it works:

- **The Graph's official decentralized network (Subgraph Studio)**:
  confirmed via `thegraph.com/docs/en/supported-networks/robinhood/` that
  Robinhood Chain is an officially supported network, corroborated by
  three independent third-party indexers (Goldsky, Ormi, Envio) that each
  separately advertise Robinhood Chain support. Not yet deployed
  end-to-end — creating a Studio project requires a wallet-authenticated
  browser session, which is a manual step still pending.
- **Self-hosted `graph-node`** (Hetzner VPS, Docker: `graph-node` +
  Postgres + IPFS, `ethereum: robinhood:https://rpc.mainnet.chain.robinhood.com`):
  fully deployed and verified. A subgraph indexing all 5 raw Chainlink
  aggregators (`AnswerUpdated`/`NewRound` events) synced successfully and
  returned real on-chain data distinguishable per feed via a `feedAddress`
  field — TSLA 22, AMZN 9, PLTR 19, AMD 26, NVDA 13 `AnswerUpdated` events
  indexed over a ~500K-block window, prices matching the expected range
  for each symbol. This is the currently-running foundation for the
  rolling-window computation layer (`subgraph/` in this repo).

Both paths are viable; the self-hosted path is what active development
builds on for now, with Studio deployment to follow once the manual
account-creation step is done — this is not a single-path bet made without
checking the alternative first.

## Handling approach

- Computation layer performs a sanity check on each round's decimals value
  against the feed's documented standard decimals value.
- Rounds failing this check are flagged `isAnomalous: true`.
- Anomalous rounds are excluded from volatility/historical-range
  calculations but retained in raw data (not deleted).
- This exclusion rule MUST be mirrored exactly in the Reference Model
  (`verification/settlement/`) — the same per-feed cutoffs, not a
  simplified version — or Graph computation results and Reference Model
  recomputation will diverge, creating a new inconsistency.

## PriceRangeIndex — rolling-window computation layer (Direction 1)

Schema design approved 2026-09-05 (`subgraph/schema.graphql`). Three
statistics are computed per feed on every `AnswerUpdated` event, over a
rolling window of the last N=20 normalized prices: moving average,
volatility, and percentile rank. All three are computed unconditionally
from whatever window size is actually available — the handler does not
wait for 20 samples to accumulate before producing output, and does not
pad a short window with placeholder values.

### Entity responsibility split

Two entities, not one, because "incremental state" and "per-event
historical record" are different jobs that a single entity can't do at
once:

- **`FeedWindow`** (mutable, one row per feed, `id = feedAddress`): pure
  internal bookkeeping. Holds the rolling `prices` array (max 20 entries,
  oldest first). Loaded and overwritten in place on every `AnswerUpdated`
  event. The mapping handler never re-scans historical events to rebuild
  this array — the array itself *is* the state, which is what makes the
  update incremental rather than a full historical recomputation.
- **`PriceRangeIndex`** (immutable, one row per `AnswerUpdated` event): the
  output. A snapshot of mean/volatility/percentile computed immediately
  after that event's price is pushed into the window, plus
  `actualWindowSize` and `isFullWindow` recording exactly how many samples
  that computation was based on. This is the entity compared row-by-row
  against the Python reference model.

### percentileRank definition

```
percentileRank = (count of window values <= currentPrice) / actualWindowSize * 100
```

computed *after* the triggering event's price has been pushed into the
window, so the window used for ranking includes the value being ranked.

**Honest disclosure**: this is one convention among several reasonable
ways to define percentile rank (e.g. strict `<` instead of `<=`, or an
interpolated/averaged-rank definition for ties). It was chosen
specifically because it has no tie-handling ambiguity — every value in
the window, including exact duplicates, gets an unambiguous count —
not because it is *the* standard definition. A different, equally
defensible convention would produce different numbers on a window
containing duplicate prices. For small windows (fewer than 5 samples,
which happens for AMZN and NVDA today — see below) this number carries
correspondingly less statistical meaning; that caveat should be disclosed
alongside any demo/writeup use of this figure, not hidden.

### volatility definition

```
volatility = sample standard deviation (ddof=1) of the window
```

Chosen over population standard deviation (ddof=0) because the window is
a sample drawn from an underlying continuous price process, not a
complete enumeration of that process — the standard framing in
quantitative finance for exactly this situation. It also matches
`numpy.std(ddof=1)` and pandas' `.std()` default, so a reader can
spot-check the reference model's output with standard tooling without
first having to guess which convention was used.

### Window size and short-window handling

N=20. As of 2026-09-05, indexed event counts per feed are TSLA 22, AMZN 9,
PLTR 19, AMD 26, NVDA 13 — so AMZN and NVDA currently never reach a full
window. `actualWindowSize` and `isFullWindow` on every `PriceRangeIndex`
row make this state explicit rather than silent; consumers of this data
(the AI decision engine, demo narration, writeup) should read
`isFullWindow` before treating `movingAverage`/`volatility`/
`percentileRank` as based on the intended N=20 sample size.

## AI Decision Engine (`decision-engine/`)

Consumes `PriceRangeIndex` (above) and, for a directional decision, calls the AgentKit relayer
(`relayer/`) for a World ID attestation status. Does not call `placeBet()`.

### Decision engine signal direction

Step 2's consistency check (`decision-engine/src/bet-decision.js`) is **momentum/continuation**,
not mean-reversion: `percentileRank` near the top of its window (`HIGH`, ≥80) combined with a
rising `movingAverage` (`UP`) triggers `BULL`; `LOW` (≤20) combined with `DOWN` triggers `BEAR`.
Any other combination — level not extreme, no prior snapshot for the symbol yet, or level and
trend disagreeing — is `NO_TRADE`, not flipped to the opposite direction.

This is one reasonable strategy assumption among several, not a claim that momentum is the
correct or only valid trading logic — mean-reversion (extreme percentile + trend now reversing
→ bet on the pullback) is equally defensible and was considered. Momentum was chosen because
this project's narrative goal is a **verifiable reasoning trace**, not a precision trading
strategy: momentum's cause-and-effect (price near a recent high, still climbing → bet it
continues) is the easier one for a reviewer to check against a historical price chart by eye,
without needing to accept a reversal-timing assumption on faith. A different, equally
legitimate design could reasonably choose mean-reversion instead.

Confirmed empirically against the real 89-row `PriceRangeIndex` history
(`verification/decision/`, same dataset as the section above): of 32 real `NO_TRADE` outcomes,
27 were "level not extreme" and 5 were "no prior snapshot yet" — zero were a genuine
level/trend contradiction. The contradiction-handling branch exists and is unit-tested
(`decision-engine/test/bet-decision.test.js`), but this particular historical window happened
not to exercise it live.

### Thresholds (must stay in sync between `decision-engine/src/config.js` and
`verification/decision/reference_model.py` — see that directory's comparison report)

- `PERCENTILE_HIGH_THRESHOLD` / `PERCENTILE_LOW_THRESHOLD` = 80 / 20 — informal "extreme
  decile" cutoffs, not backtested against this dataset.
- `VOLATILITY_ANOMALY_RATIO` = 1.5 — Step 1's query-worth signal fires when current volatility
  is at least 1.5× a symbol's own trailing average volatility so far.
- `QUERY_THROTTLE_MS` = 5 minutes — matches the 5-minute window already used elsewhere in this
  codebase (AgentKit's own SIWE `maxAge`, this project's Robinhood-side nonce expiry in
  `relayer/src/config.js`) for internal consistency, not because 5 minutes is derived from
  anything specific to query cost.
- `MAX_BET_SIZE_WEI` = 0.001 ETH — pinned to the deployed contract's own documented minimum bet
  (see the root `README.md`'s "Fees & Security"), so it is demo-scale by construction rather
  than by a guessed ETH/USD conversion.
