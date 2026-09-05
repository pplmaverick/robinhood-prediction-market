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
