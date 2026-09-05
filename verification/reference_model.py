"""
Independent Reference Model Testing — Python reference model (Phase 2).

Re-implements, from the specification alone, the three pieces of on-chain
logic in AgentStockMarket.sol whose correctness this verification exists to
check:

  1. attestation_hash(agent_address, human_id, market_id, direction, amount,
     robinhood_nonce, issued_at, expires_at) -> bytes32
     = keccak256(abi.encodePacked(address, uint256, uint256, uint8, uint256,
       uint256, uint256, uint256)) over exactly those eight fields, in that
       order, tightly packed (no padding between fields, as Solidity's
       abi.encodePacked does for value types).

  2. verify_attestation(hash, v, r, s, expected_signer) -> bool
     = raw secp256k1 recovery over the digest exactly as given — no
       EIP-191 ("\\x19Ethereum Signed Message") or EIP-712 prefix, matching
       Solidity's ecrecover(hash, v, r, s), which never adds one either.
       v is taken in Solidity's 27/28 convention.

  3. calculate_payout(bet_amount, direction, bull_pool, bear_pool, open_price,
     close_price) -> int
     = tie-break rule: close_price >= open_price always resolves to BULL,
       with no refund path for a tie (a disclosed limitation carried over
       from the source contract, not something this model papers over).
       A losing bet pays out 0. A winning bet pays
       bet_amount * total_pool // winning_pool (integer/floor division,
       matching Solidity's uint256 division).

This module intentionally has no dependency on, or import of, AgentStockMarket.sol
or any of its build artifacts — it is written directly from the prose spec.
"""
import json
from pathlib import Path

from eth_abi.packed import encode_packed
from eth_keys.datatypes import Signature
from eth_utils import keccak, to_checksum_address

BULL = 0
BEAR = 1


def attestation_hash(agent_address, human_id, market_id, direction, amount,
                      robinhood_nonce, issued_at, expires_at) -> bytes:
    packed = encode_packed(
        ["address", "uint256", "uint256", "uint8", "uint256", "uint256", "uint256", "uint256"],
        [
            to_checksum_address(agent_address),
            int(human_id),
            int(market_id),
            int(direction),
            int(amount),
            int(robinhood_nonce),
            int(issued_at),
            int(expires_at),
        ],
    )
    return keccak(packed)


def verify_attestation(hash_: bytes, v: int, r: int, s: int, expected_signer: str) -> bool:
    recovery_id = v - 27  # Solidity convention (27/28) -> secp256k1 recovery id (0/1)
    if recovery_id not in (0, 1):
        return False
    try:
        sig = Signature(vrs=(recovery_id, r, s))
        recovered = sig.recover_public_key_from_msg_hash(hash_)
    except (ValueError, Exception):
        return False
    return recovered.to_checksum_address().lower() == to_checksum_address(expected_signer).lower()


def calculate_payout(bet_amount: int, direction: int, bull_pool: int, bear_pool: int,
                      open_price: int, close_price: int) -> int:
    winner = BULL if close_price >= open_price else BEAR
    if direction != winner:
        return 0
    total_pool = bull_pool + bear_pool
    winning_pool = bull_pool if winner == BULL else bear_pool
    return (bet_amount * total_pool) // winning_pool


def _hex_to_int(h: str) -> int:
    return int(h, 16)


def run(test_vectors_path: Path, relayer_address: str):
    data = json.loads(test_vectors_path.read_text())
    results = []

    for case in data["cases"]:
        attestations = case["attestations"]

        # Deduplicate identical attestations (case 05_attestation_replay submits
        # the literal same attestation twice on purpose) -- there is only one
        # distinct signed message under test there, so expected_hash /
        # expected_signer_valid should report one value, not a repeated pair.
        distinct_attestations = []
        seen = set()
        for a in attestations:
            key = json.dumps(a, sort_keys=True)
            if key not in seen:
                seen.add(key)
                distinct_attestations.append(a)

        # Independently recompute the hash for every distinct attestation in
        # the case, and independently verify its signature against the relayer
        # address.
        computed = []
        for a in distinct_attestations:
            h = attestation_hash(
                a["agent_address"], a["human_id"], a["market_id"], a["direction"],
                a["amount_wei"], a["robinhood_nonce"], a["issued_at"], a["expires_at"],
            )
            sig = a["signature"]
            valid = verify_attestation(
                h, sig["v"], _hex_to_int(sig["r"]), _hex_to_int(sig["s"]), relayer_address,
            )
            computed.append({"hash": "0x" + h.hex(), "signer_valid": valid})

        # Payouts: only meaningful for cases that reach settlement (i.e. have a
        # "settle" block and per-agent claims). Bets that are rejected at
        # placeAgentBet time (expired / wrong signer / over max) never accrue
        # into a pool, so payout is not applicable for them.
        payouts = {}
        if case.get("settle"):
            open_price = case["settle"]["open_price"]
            close_price = case["settle"]["close_price"]

            bull_pool = sum(
                int(a["amount_wei"]) for a in attestations if a["direction"] == BULL
            )
            bear_pool = sum(
                int(a["amount_wei"]) for a in attestations if a["direction"] == BEAR
            )
            # Case 5 (replay) deliberately submits the same attestation twice;
            # only the first placement actually lands in the pool.
            if case["case_id"] == "05_attestation_replay":
                a0 = attestations[0]
                bull_pool = int(a0["amount_wei"]) if a0["direction"] == BULL else 0
                bear_pool = int(a0["amount_wei"]) if a0["direction"] == BEAR else 0

            for claim in case["claims"]:
                agent = claim["agent_address"]
                a = next(a for a in attestations if a["agent_address"] == agent)
                payout = calculate_payout(
                    int(a["amount_wei"]), a["direction"], bull_pool, bear_pool,
                    open_price, close_price,
                )
                payouts[agent] = payout if payout > 0 else None

        # expected_signer_valid: single bool if every attestation in the case
        # signs the same way (all cases here do), else a per-attestation list.
        signer_valid_values = [c["signer_valid"] for c in computed]
        expected_signer_valid = (
            signer_valid_values[0] if len(set(signer_valid_values)) == 1 else signer_valid_values
        )

        expected_hash = computed[0]["hash"] if len(computed) == 1 else [c["hash"] for c in computed]

        if not payouts:
            expected_payout = None
        elif len(payouts) == 1:
            expected_payout = next(iter(payouts.values()))
            expected_payout = str(expected_payout) if expected_payout is not None else None
        else:
            expected_payout = {k: (str(v) if v is not None else None) for k, v in payouts.items()}

        results.append({
            "case_id": case["case_id"],
            "expected_hash": expected_hash,
            "expected_signer_valid": expected_signer_valid,
            "expected_payout": expected_payout,
        })

    return results


if __name__ == "__main__":
    here = Path(__file__).parent
    vectors_path = here / "test_vectors.json"
    meta = json.loads(vectors_path.read_text())["_meta"]

    results = run(vectors_path, meta["relayer_address"])

    out_path = here / "python_expected_results.json"
    out_path.write_text(json.dumps(results, indent=2) + "\n")
    print(f"wrote {out_path} ({len(results)} cases)")
    for r in results:
        print(f"  {r['case_id']}: signer_valid={r['expected_signer_valid']} payout={r['expected_payout']}")
