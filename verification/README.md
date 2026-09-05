# Independent Reference Model Testing — AgentStockMarket.sol

This directory documents an Independent Reference Model Testing run against
`contracts/AgentStockMarket.sol`: a from-spec Python re-derivation of the
contract's hashing, signature-verification, and payout logic, cross-checked
against the actual Solidity contract exercised under `forge test`, with the
inputs and both sets of outputs sealed via SHA-256 commitments.

This is a companion to the existing `verification/settlement/`,
`verification/decision/`, and `verification/graph-computation/` reference
models in this repo, following the same method: write the checking logic
from the specification (not by reading the implementation), run both sides
against the same test vectors, and diff the outputs field-by-field with no
silent pass.

## Scope

- **Contract under test:** `contracts/AgentStockMarket.sol` (not yet deployed
  anywhere — this is pre-deployment verification only; see "Stop point" below).
- **`_sourceMarket` reference:** `0x72DAb8B1B53b3CF028e9A0d1E21178981f264245`,
  the real `StockPredictionMarket` already live on Robinhood Chain mainnet
  (chain ID 4663) — see `docs/submission_existing_work.md`. Read-only in this
  verification (fork test only; see below).
- **`_maxBetSizeWei`:** `1000000000000000` (1e15 wei = 0.001 ETH), read from
  `decision-engine/src/config.js`'s `MAX_BET_SIZE_WEI` default.

## ⚠️ Ephemeral test-only relayer key — NOT the production relayer identity

`_relayerAddress` for every test in this suite is a keypair generated fresh
via `cast wallet new` for this verification task only, per an explicit
decision to avoid touching any real or placeholder relayer identity in this
repo (`relayer/.env` does not exist; `decision-engine/.env` has no
`RELAYER_PRIVATE_KEY`):

```
relayer_address:      0x38443D7031F0AE5631C17A584Ca96441EbF07051
wrong_signer_address: 0xBd517d99935db681e81A9aeC83fE70DEfCC8981f  (case 06 only)
```

Both private keys are recorded in plaintext in `test_vectors.json`'s `_meta`
block and in `verification/generate_test_vectors.py` and
`test/AgentStockMarket.t.sol` — this is intentional and safe *only* because
these keys hold no funds, control no real deployment, and were generated
solely for this test run. **Do not deploy `AgentStockMarket` to any real
network with this address as `_relayerAddress`, and do not reuse either key
for anything else.** A real deployment needs its own relayer identity,
sourced the way the rest of the relayer pipeline does (see
`relayer/.env.example`), which is out of scope for this verification.

## Pipeline

```
verification/generate_test_vectors.py   (signs with the two ephemeral keys)
        │
        ▼
verification/test_vectors.json          (9 scenarios, raw fields only)
        │                       │
        ▼                       ▼
reference_model.py       test/AgentStockMarket.t.sol  (forge test)
(pure Python re-derivation)     (actual contract + mock IStockPredictionMarket)
        │                       │
        ▼                       ▼
python_expected_results.json   solidity_actual_results.jsonl
        │                             │
        │                             ▼
        │                    aggregate_solidity_results.py
        │                             │
        │                             ▼
        │                    solidity_actual_results.json
        │                             │
        └──────────► compare_results.py ◄──────┘
                             │
                             ▼
                      commitments.sha256 (SHA-256 of all three JSON files)
```

**Independence, precisely stated:** `reference_model.py` implements
`attestation_hash`, `verify_attestation`, and `calculate_payout` from the
prose specification, using `eth_abi`/`eth_utils`/`eth_keys` — never importing
or reading `AgentStockMarket.sol`. `test/AgentStockMarket.t.sol` recomputes
the same attestation hash itself (`abi.encodePacked` + `keccak256`) and signs
it itself (`vm.sign`), rather than trusting any precomputed hash/signature
from `test_vectors.json` — the JSON file supplies the raw scenario
parameters and the two ephemeral private keys, and both sides derive
everything else independently. The only thing that would make them agree
despite a real bug is a coincidence in two separately-written
implementations across two different languages and cryptography stacks —
which is the point.

## The 9 scenarios

| case_id | what it proves |
|---|---|
| `01_bull_wins_normal` | Mixed pool, BULL wins outright (no tie), sole BULL bettor collects the whole pool. |
| `02_bear_wins_normal` | Mirror of 01 for BEAR. |
| `03_tie_bull_wins` | `closePrice == openPrice` → BULL wins per the disclosed tie-break rule; **there is no refund path for a tie**, matching the source contract's own behavior. |
| `04_attestation_expired` | `placeAgentBet` called after `expiresAt` → reverts `"attestation expired"`. |
| `05_attestation_replay` | The identical attestation + signature submitted twice → second call reverts `"attestation already used"`; first bet still settles and pays out normally. |
| `06_wrong_signer` | Well-formed attestation signed by a non-relayer key → `ecrecover` returns a different address → reverts `"invalid attestation signature"`. |
| `07_amount_exceeds_max` | `amount` one wei above `maxBetSizeWei` → reverts `"exceeds max bet size"`, checked before signature/market checks. |
| `08_multi_agent_proportional` | Two BULL bettors of different sizes plus one BEAR bettor; BULL wins; each winner's payout is proportional to their share of the winning pool (`amount * totalPool / winningPool`), losing bettor's claim reverts. |
| `09_sole_side_full_refund` | All three bettors are on the winning side (no losing pool at all) → each gets back exactly their own stake, no profit, no loss. |

## Fork test

`test_fork_marketsViewMatchesRealContract` (`test/AgentStockMarket.t.sol`)
forks `https://rpc.mainnet.chain.robinhood.com` (chain ID 4663, confirmed
live) and calls `markets(0)` on the real, already-deployed
`StockPredictionMarket` at `0x72DAb8B1B53b3CF028e9A0d1E21178981f264245`,
asserting the returned tuple is structurally sane (valid `MarketState`,
non-empty symbol, `closeTime >= openTime`). **Read-only — no transaction is
ever sent in this test.** It exists to confirm `IStockPredictionMarket`'s
interface (as declared in `AgentStockMarket.sol`) actually matches what the
real deployed contract returns, independent of the 9 mock-driven scenario
tests above.

## Results

**`forge test` — all 10 pass:**

```
Ran 10 tests for test/AgentStockMarket.t.sol:AgentStockMarketTest
[PASS] test_01_bullWinsNormal() (gas: 829350)
[PASS] test_02_bearWinsNormal() (gas: 809346)
[PASS] test_03_tieBullWins() (gas: 824504)
[PASS] test_04_attestationExpired() (gas: 168509)
[PASS] test_05_attestationReplay() (gas: 522425)
[PASS] test_06_wrongSigner() (gas: 174489)
[PASS] test_07_amountExceedsMax() (gas: 169042)
[PASS] test_08_multiAgentProportional() (gas: 1152630)
[PASS] test_09_soleSideFullRefund() (gas: 1147102)
[PASS] test_fork_marketsViewMatchesRealContract() (gas: 38842)
Suite result: ok. 10 passed; 0 failed; 0 skipped; finished in 4.92s (4.93s CPU time)
```

**`compare_results.py` — all 9 cases match:**

```
Compared 9 cases across python_expected_results.json and solidity_actual_results.json

ALL CASES MATCH — Python reference model and Solidity contract agree on every field, every case.
```

## Reproducing

```bash
cd verification
python3 generate_test_vectors.py        # -> test_vectors.json
python3 reference_model.py              # -> python_expected_results.json
cd ..
rm -f verification/solidity_actual_results.jsonl
forge test --match-contract AgentStockMarketTest -vv
python3 verification/aggregate_solidity_results.py   # .jsonl -> solidity_actual_results.json
python3 verification/compare_results.py
shasum -a 256 verification/test_vectors.json verification/python_expected_results.json \
  verification/solidity_actual_results.json > verification/commitments.sha256
```

## Known observations (not fixed here — spec was implemented verbatim)

These were noticed while building the test suite. Per instruction, the
contract logic in `AgentStockMarket.sol` was implemented exactly as
specified, with no unilateral changes — these are flagged for a human
decision, not silently patched:

1. **No re-bet guard.** Unlike the source `StockPredictionMarket.placeBet()`
   (`require(bets[marketId][msg.sender].amount == 0, "Already bet")`),
   `placeAgentBet` has no check preventing the same `agentAddress` from
   placing a second, different attestation for the same `marketId`. Since
   `agentBets[marketId][agentAddress]` is overwritten (not additive) while
   `agentBullPool`/`agentBearPool` are incremented on every accepted bet,
   a second bet from the same agent on the same market would inflate the
   pool denominator without a corresponding claimable record for the first
   bet — diluting other agents' payouts. None of the 9 scenarios above
   exercise this path (each agent bets at most once per market), so it did
   not surface as a test failure here.
2. **`placeAgentBet` does not check `msg.sender == a.agentAddress`.** Any
   address holding a validly-signed attestation can submit it and pay the
   ETH; the bet is recorded under `a.agentAddress` regardless of who called.
   This may be intentional (meta-tx-style relaying), but is worth confirming.
3. **Tie has no refund path**, by design parity with the source contract
   (`docs/submission_existing_work.md` already documents this as a known,
   currently-unfixed gap in `StockPredictionMarket.claimWinnings()` too).
   Scenario 03 exists specifically to pin this behavior down, not to flag it
   as new.

## Stop point

No deployment (`forge script` or otherwise) and no `git push` have been done
as part of this work. Everything above is local verification only, committed
to this branch for human review before any deployment discussion proceeds.
