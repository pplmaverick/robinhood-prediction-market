# Settlement Logic — Independent Verification Report

Scope: `settleMarket()` and `claimWinnings()` on `StockPredictionMarket`
(`0x72DAb8B1B53b3CF028e9A0d1E21178981f264245`, Robinhood Chain Mainnet,
chain ID 4663) only. `createMarket()` / `lockMarket()` were not reviewed;
their emitted events were read only as supporting data (market params,
open price) needed to reconstruct settlement inputs.

All data below is pulled live via direct JSON-RPC against
`https://rpc.mainnet.chain.robinhood.com` (Blockscout's API is behind a
Cloudflare managed challenge and returned HTTP 403 to unauthenticated
requests — not used). No mocked or synthetic data appears anywhere in
`test_cases.json`. Pipeline: `pull_data.py` → `decode_events.py` →
`join_markets.py` → `build_and_compare.py`, all re-runnable from repo root.

## Step 1 — Transaction breakdown (real counts)

Full contract history, block 0 → 53,125,658 (chain tip at pull time),
87 logs / 87 unique transactions, one event per transaction:

| Method | Count |
|---|---|
| createMarket | 29 |
| lockMarket | 27 |
| settleMarket | 27 |
| placeBet | 3 |
| claimWinnings | 1 |

| Sender | Count |
|---|---|
| `0xed2B5717c9b936ecC76d75401026A99143e278F5` (owner/keeper) | 85 |
| `0x52905A5E83A83F6a9d0e64Ad24e79a37512D35B9` | 2 |

**Note:** the task brief assumed 22 settleMarket calls. The real, verified
count is **27**. Markets 27–28 (TSLA/AMZN) are open (never locked); all 27
locked markets were also settled — there are no locked-but-unsettled
markets. Only market 5 ever received bets from more than the owner
address, and it is the only market with a `claimWinnings` call.

## Step 4 — Comparison results

| Check | Result |
|---|---|
| settleMarket outcome (winner) matches on-chain, 27/27 | **PASS** |
| claimWinnings payout matches on-chain, 1/1 | **PASS** |

Zero mismatches. No model adjustments were made to force a match — the
model was written from spec first (see `reference_model.py` docstring),
then run once against the real data.

The single `claimWinnings` case (market 5, TSLA) is also the contract's
one on-chain tie: `openPrice == closePrice == 39,682,820,000`, resolved
BULL per the `>=` rule. Bettor `0xed2B5717...` bet 0.002 ETH BULL, bettor
`0x52905A5E...` bet 0.003 ETH BEAR. Model: `totalPool=5e15`,
`fee=totalPool*200/10000=1e14`, `winnerPool=2e15` (BULL),
`payout=((5e15-1e14)*2e15)//2e15=4.9e15` — matches the actual claimed
amount (4,900,000,000,000,000 wei) exactly.

## Step 3 — Findings

### 1. Decimals normalization: absent by design, structurally inert here

`StockPredictionMarket` never calls `decimals()` on the price feed and
compares raw `int256` `answer` values directly
(`closePrice >= openPrice`). `ChainlinkPriceFeed.decimals()` is a pass-
through to the underlying aggregator with no normalization step either.
This is a genuine architectural gap — the system has no defense if a
market's `openPrice` and `closePrice` were ever read at different
decimals precision.

In practice, across the 27 real settlements, this could not have
manifested: `ChainlinkPriceFeed.aggregator` is `immutable` (fixed at the
wrapper's construction) and `decimals()` reads live from that same fixed
aggregator both times a given market's price is read. All 27 markets used
one of the five wrapper addresses from `createMarket()` calldata, each
verified now to still be its original `aggregator` (queried on-chain,
see table below); no aggregator address ever changed. So: the
**vulnerability class is real and unmitigated** (worth fixing before any
oracle migration), but it has **not been triggered** by any of the 27
historical cases. This is a code-level finding, not an observed incident.

### 2. Staleness handling: exists, verified live, and provably enforced on every historical call

The staleness check does **not** live in `StockPredictionMarket.settleMarket()`
itself — it lives in the `ChainlinkPriceFeed` wrapper, which every real
market's `priceFeed` calldata argument points to (verified: all 29
`createMarket()` calls used the exact 5 wrapper addresses from
`README.md`, never the raw Chainlink aggregator or `MockPriceFeed`).

Queried live on-chain (these are `immutable` constructor values, so they
have held since each wrapper's deployment — no historical archive query
needed to know they applied at every past call):

| Symbol | maxStaleness (s) | = 3 days? | aggregator | decimals |
|---|---|---|---|---|
| TSLA | 259200 | yes | `0x4A1166a659A55625345e9515b32adECea5547C38` | 8 |
| AMZN | 259200 | yes | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | 8 |
| PLTR | 259200 | yes | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | 8 |
| AMD | 259200 | yes | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | 8 |
| NVDA | 259200 | yes | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 8 |

The README's "3-day threshold" claim checks out exactly — this was
verified against live contract state, not assumed.

`ChainlinkPriceFeed.latestRoundData()` reverts (`answer > 0`,
`updatedAt > 0`, `block.timestamp - updatedAt <= maxStaleness`) before
returning a price, in the same call frame `settleMarket()` uses. All 27
`settleMarket` transactions and the 1 `claimWinnings` transaction have
receipt `status == 1` (success). Since a failed staleness/sanity check
would have reverted the entire `settleMarket` transaction (no partial
state, no event), **transaction success is itself on-chain proof the
staleness check passed at call time for all 27 cases** — this closes the
staleness check without needing historical archive state (see limitation
below).

**Known limitation, disclosed rather than worked around:** the RPC node
does not retain archive state — `eth_call` for `latestRoundData()` at any
historical block (tested at blocks 1,841,386 / 10,110,542 / 45,807,949,
all far short of the current tip) fails with
`{"code":-32000,"message":"metadata is not found, <block>"}`. The
underlying aggregators also do not emit a standard Chainlink
`AnswerUpdated` event — each of the five has only 2 log entries in its
entire on-chain history, of a non-standard event shape not decoded here
(out of scope; would require aggregator source, not available). So the
exact `roundId` / `updatedAt` of the specific round each historical
`settleMarket` call read cannot be independently reconstructed after the
fact. What **is** independently confirmed is the immutable per-feed
staleness/decimals configuration (table above) and, via transaction
success, that the check passed every time it ran.

### 3. Real finding, not in the task's original checklist: every settlement to date is a tie, resolved by a sub-11-second lock→settle gap

This fell out of building the model against real data and is reported
factually, not as an accusation: **all 27 of 27 real settlements have
`openPrice == closePrice` bit-for-bit.** Under the disclosed
tie-defaults-to-BULL rule, this means **BULL has won 27/27 real
settlements** — no BEAR outcome has occurred on this contract to date.

The immediate, verified cause: in every one of the 27 cases,
`settleMarket()` was called 2–11 seconds after `lockMarket()` for the
same market (see `test_cases.json`, `lockBlock`/`settleBlock` /
corresponding timestamps in `raw_data/markets_joined.json`), regardless
of the market's advertised `duration` (ranging 1 hour to 14 days in the
real `createMarket` calldata). Since the underlying price aggregators
show only 2 log events across their entire history (consistent with an
infrequently-updating feed), a lock and settle placed seconds apart read
the same underlying round every time.

Nothing in `StockPredictionMarket` requires a minimum gap between
`lockMarket()` and `settleMarket()` — `settleMarket()` only checks
`state == LOCKED`. This is a keeper/operational pattern (owner-controlled
calls, both from `0xed2B5717...`), not a contract bug, but it is directly
relevant to the settlement logic being verified here: it means the
27 on-chain settlements observed so far have not yet exercised a genuine
price-moved-between-lock-and-settle path at all, and every BULL bettor
so far has won by construction rather than by prediction. Recommend
flagging this for the keeper/operations side rather than the contract
side.

### 4. README's "no winner scenario: all bets refunded in full" claim — no such code path exists, but never triggered

`claimWinnings()` has no refund branch. If a market's winning side has a
zero pool, `payout = (...)/winnerPool` divides by zero for any caller who
could reach that line — but no such caller can exist, since a zero pool
means nobody bet that direction, so nobody has `b.direction == winner`
to pass the earlier `require`. Net effect: any losing side's stake in a
market where the winning side got zero bets would be **permanently
stranded** in the contract, with no path to reclaim it. This did not
happen in the real data — only market 5 ever received more than one bet,
and both its BULL and BEAR pools were non-zero. Documented here because
the README states a refund behavior the deployed code does not
implement; the code and the doc disagree, independent of whether the
scenario has occurred yet.

## Files

- `reference_model.py` — independent Python model (spec-derived, see its docstring)
- `pull_data.py`, `decode_events.py`, `join_markets.py`, `build_and_compare.py` — reproducible real-data pipeline (Robinhood Chain RPC only, no mocks)
- `raw_data/` — raw pulled logs/transactions/decoded events/feed config, kept for auditability
- `test_cases.json` — the 27 settleMarket + 1 claimWinnings real cases, model outputs, pass/fail
- `commitments.sha256` — SHA-256 of `test_cases.json` as committed (`sha256sum verification/settlement/test_cases.json` to reproduce)
