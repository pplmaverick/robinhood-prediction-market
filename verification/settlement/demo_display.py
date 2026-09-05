"""
Demo-facing display for the settlement verification trace.

Reads the already-sealed verification artifacts (test_cases.json,
commitments.sha256) and re-runs reference_model.py live against every case
to show the two independent sources — the Python model and the pulled
on-chain actuals — side by side. Read-only: writes nothing back to
test_cases.json or comparison_report.md.
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from reference_model import determine_winner, compute_payout, Direction

CONTRACT = "0x72DAb8B1B53b3CF028e9A0d1E21178981f264245"
CHAIN = "Robinhood Chain Mainnet, chain 4663"


def eth(wei: int) -> str:
    return f"{wei / 10**18:.6f} ETH"


def main() -> None:
    test_cases = json.loads((HERE / "test_cases.json").read_text())
    sealed_line = (HERE / "commitments.sha256").read_text().strip().split()
    sealed_hash = sealed_line[0]

    settle_cases = test_cases["settleMarket"]
    claim_cases = test_cases["claimWinnings"]
    n_settle = len(settle_cases)
    n_claim = len(claim_cases)

    print("Independent Reference Model Verification")
    print(f"Contract: {CONTRACT}  ({CHAIN})")
    print("Source A: reference_model.py, recomputed live below")
    print("Source B: on-chain actuals, pulled via JSON-RPC into test_cases.json")
    print()

    settle_pass = 0
    for i, c in enumerate(settle_cases, start=1):
        modeled = determine_winner(c["openPrice"], c["closePrice"])
        actual = Direction(c["actualWinner"])
        ok = modeled == actual
        settle_pass += ok

        print(f"[{i}/{n_settle}] settleMarket tx 0x{c['settleTxHash']} "
              f"(market_id={c['marketId']}, {c['symbol']})")
        print(f"  oracle prices    open={c['openPrice']} close={c['closePrice']}  "
              f"feed={c['priceFeed']}")
        print(f"  python model     -> winner: {modeled.name}")
        print(f"  on-chain actual  -> winner: {actual.name}")
        print(f"  {'✓ MATCH' if ok else '✗ MISMATCH'}")
        print()

    claim_pass = 0
    for i, c in enumerate(claim_cases, start=1):
        direction = Direction(c["betDirection"])
        winner = determine_winner(c["openPrice"], c["closePrice"])
        modeled_payout = compute_payout(c["bullPool"], c["bearPool"], winner, c["betAmount"])
        actual_payout = c["actualPayout"]
        ok = modeled_payout == actual_payout
        claim_pass += ok

        print(f"[{i}/{n_claim}] claimWinnings tx 0x{c['claimTxHash']} "
              f"(market_id={c['marketId']}, {c['symbol']})")
        print(f"  bettor {c['user']}  bet {eth(c['betAmount'])} on {direction.name}")
        print(f"  pools  bull={eth(c['bullPool'])}  bear={eth(c['bearPool'])}")
        print(f"  python model     -> payout: {eth(modeled_payout)}")
        print(f"  on-chain actual  -> payout: {eth(actual_payout)}")
        print(f"  {'✓ MATCH' if ok else '✗ MISMATCH'}")
        print()

    live_hash = hashlib.sha256((HERE / "test_cases.json").read_bytes()).hexdigest()
    seal_ok = live_hash == sealed_hash

    print("=" * 70)
    print(f"{settle_pass}/{n_settle} settleMarket + {claim_pass}/{n_claim} claimWinnings verified")
    print(f"Trace sealed: verification/settlement/commitments.sha256"
          f"  ({'seal intact' if seal_ok else 'SEAL MISMATCH'})")
    print(f"SHA256: {live_hash}")
    print("=" * 70)

    if settle_pass != n_settle or claim_pass != n_claim or not seal_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
