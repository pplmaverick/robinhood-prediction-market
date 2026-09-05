"""
Independent Reference Model Testing — test vector generation (Phase 3).

Produces verification/test_vectors.json: the shared set of raw scenario
parameters consumed independently by:
  - verification/reference_model.py   (Python re-derivation of hash / signature
    verification / payout math)
  - test/AgentStockMarket.t.sol       (Foundry: the actual contract under test)

This script is the ONLY place the two ephemeral test private keys are used to
sign anything. Neither reference_model.py nor the Foundry test trusts a
precomputed hash from here — both recompute attestation_hash() themselves from
the raw fields below and only take the (v, r, s) signature as an opaque input
to verify, exactly as a real relayer's output would be treated.

Signing is raw secp256k1 over the keccak256 digest — no EIP-191/712 prefix —
matching relayer/src/attestation.js's signRawHash(). Uses eth_keys directly
(NOT eth_account, which defaults to EIP-191 personal_sign framing).
"""
import json
from pathlib import Path

from eth_abi.packed import encode_packed
from eth_keys.datatypes import PrivateKey
from eth_utils import keccak, to_checksum_address

# TEST-ONLY ephemeral keys, generated fresh via `cast wallet new` for this
# verification task only (2026-09-05). NOT the production relayer identity —
# never reused outside this test suite.
RELAYER_PRIVATE_KEY = "0x025810031d9dbdd6eea63e8ecd4d9a8b58f26fdcc17317ea7cdfcc52bbe4cc27"
RELAYER_ADDRESS = "0x38443D7031F0AE5631C17A584Ca96441EbF07051"
WRONG_SIGNER_PRIVATE_KEY = "0x55fddaf6a6998db89fe6855ea24660cfcb7448b4bd4c1d4642ccf1a67571102c"
WRONG_SIGNER_ADDRESS = "0xBd517d99935db681e81A9aeC83fE70DEfCC8981f"

MAX_BET_SIZE_WEI = "1000000000000000"  # decision-engine/src/config.js MAX_BET_SIZE_WEI default

KEYS = {
    "relayer": PrivateKey(bytes.fromhex(RELAYER_PRIVATE_KEY[2:])),
    "wrong_signer": PrivateKey(bytes.fromhex(WRONG_SIGNER_PRIVATE_KEY[2:])),
}


def addr(n):
    # Offset well clear of 0x01-0x09 (reserved EVM precompile addresses) so these
    # can safely receive value transfers in the Foundry tests without colliding
    # with precompile call semantics.
    return to_checksum_address(f"0x{0x1000 + n:040x}")


def attestation_hash(a):
    packed = encode_packed(
        ["address", "uint256", "uint256", "uint8", "uint256", "uint256", "uint256", "uint256"],
        [
            to_checksum_address(a["agent_address"]),
            a["human_id"],
            a["market_id"],
            a["direction"],
            int(a["amount_wei"]),
            a["robinhood_nonce"],
            a["issued_at"],
            a["expires_at"],
        ],
    )
    return keccak(packed)


def sign(a):
    h = attestation_hash(a)
    pk = KEYS[a["signer"]]
    sig = pk.sign_msg_hash(h)
    return {
        "attestation_hash": "0x" + h.hex(),
        "v": sig.v + 27,  # Solidity ecrecover expects 27/28, not the 0/1 recovery id
        "r": "0x" + sig.r.to_bytes(32, "big").hex(),
        "s": "0x" + sig.s.to_bytes(32, "big").hex(),
    }


def attestation(agent_n, human_id, direction, amount_wei, nonce, signer="relayer",
                 market_id=1, issued_at=1_000_000, expires_at=1_000_300):
    a = {
        "agent_address": addr(agent_n),
        "human_id": human_id,
        "market_id": market_id,
        "direction": direction,
        "amount_wei": str(amount_wei),
        "robinhood_nonce": nonce,
        "issued_at": issued_at,
        "expires_at": expires_at,
        "signer": signer,
    }
    a["signature"] = sign(a)
    return a


BULL, BEAR = 0, 1

cases = []

# 1. Normal BULL win: two agents, opposite directions, BULL is the sole winner
#    and collects the full pool.
a1 = attestation(1, 1, BULL, 600_000_000_000_000, 1)
a2 = attestation(2, 2, BEAR, 400_000_000_000_000, 2)
cases.append({
    "case_id": "01_bull_wins_normal",
    "description": "Two agents bet opposite directions; price rises (no tie); "
                    "sole BULL bettor collects the full pool; BEAR bettor's claim reverts.",
    "attestations": [a1, a2],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": [None, None],
    "settle": {"open_price": 100, "close_price": 110},
    "claims": [
        {"agent_address": a1["agent_address"], "expect_revert": None, "expected_payout_wei": "1000000000000000"},
        {"agent_address": a2["agent_address"], "expect_revert": "bet did not win", "expected_payout_wei": None},
    ],
})

# 2. Normal BEAR win (mirror of case 1).
b1 = attestation(3, 3, BULL, 400_000_000_000_000, 1)
b2 = attestation(4, 4, BEAR, 600_000_000_000_000, 2)
cases.append({
    "case_id": "02_bear_wins_normal",
    "description": "Two agents bet opposite directions; price falls; sole BEAR "
                    "bettor collects the full pool; BULL bettor's claim reverts.",
    "attestations": [b1, b2],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": [None, None],
    "settle": {"open_price": 200, "close_price": 150},
    "claims": [
        {"agent_address": b1["agent_address"], "expect_revert": "bet did not win", "expected_payout_wei": None},
        {"agent_address": b2["agent_address"], "expect_revert": None, "expected_payout_wei": "1000000000000000"},
    ],
})

# 3. Tie (closePrice == openPrice): BULL wins per the disclosed tie-break rule,
#    no refund path exists.
c1 = attestation(5, 5, BULL, 500_000_000_000_000, 1)
c2 = attestation(6, 6, BEAR, 500_000_000_000_000, 2)
cases.append({
    "case_id": "03_tie_bull_wins",
    "description": "openPrice == closePrice. Tie resolves to BULL (close >= open), "
                    "not to a refund. BEAR bettor loses despite the tie.",
    "attestations": [c1, c2],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": [None, None],
    "settle": {"open_price": 300, "close_price": 300},
    "claims": [
        {"agent_address": c1["agent_address"], "expect_revert": None, "expected_payout_wei": "1000000000000000"},
        {"agent_address": c2["agent_address"], "expect_revert": "bet did not win", "expected_payout_wei": None},
    ],
})

# 4. Expired attestation: placeAgentBet called after expiresAt.
d1 = attestation(7, 7, BULL, 500_000_000_000_000, 1)
cases.append({
    "case_id": "04_attestation_expired",
    "description": "placeAgentBet called at a timestamp past the attestation's expiresAt.",
    "attestations": [d1],
    "place_call_time": 1_000_301,  # > expires_at (1_000_300)
    "market_close_time": 1_010_000,
    "expect_place_revert": ["attestation expired"],
    "settle": None,
    "claims": [],
})

# 5. Replay: the identical attestation + signature submitted twice.
e1 = attestation(8, 8, BULL, 500_000_000_000_000, 1)
cases.append({
    "case_id": "05_attestation_replay",
    "description": "The same attestation (same hash, same signature) is submitted to "
                    "placeAgentBet twice. First call succeeds; second must revert.",
    "attestations": [e1, e1],  # literal replay: identical object submitted twice
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": [None, "attestation already used"],
    "settle": {"open_price": 100, "close_price": 110},
    "claims": [
        {"agent_address": e1["agent_address"], "expect_revert": None, "expected_payout_wei": "500000000000000"},
    ],
})

# 6. Wrong signer: attestation signed by a key that is not the relayer's.
f1 = attestation(9, 9, BULL, 500_000_000_000_000, 1, signer="wrong_signer")
cases.append({
    "case_id": "06_wrong_signer",
    "description": "Attestation fields are well-formed but signed by a non-relayer key.",
    "attestations": [f1],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": ["invalid attestation signature"],
    "settle": None,
    "claims": [],
})

# 7. Amount exceeds maxBetSizeWei.
g1 = attestation(10, 10, BULL, 1_000_000_000_000_001, 1)  # maxBetSizeWei + 1
cases.append({
    "case_id": "07_amount_exceeds_max",
    "description": "amount is one wei above maxBetSizeWei; correctly signed otherwise.",
    "attestations": [g1],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": ["exceeds max bet size"],
    "settle": None,
    "claims": [],
})

# 8. Multiple agents, mixed directions: proportional payout among winners.
h1 = attestation(11, 11, BULL, 300_000_000_000_000, 1)
h2 = attestation(12, 12, BULL, 200_000_000_000_000, 2)
h3 = attestation(13, 13, BEAR, 500_000_000_000_000, 3)
cases.append({
    "case_id": "08_multi_agent_proportional",
    "description": "Two BULL bettors of different sizes plus one BEAR bettor; BULL wins; "
                    "each BULL winner's payout is proportional to their share of the winning pool.",
    "attestations": [h1, h2, h3],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": [None, None, None],
    "settle": {"open_price": 100, "close_price": 150},
    "claims": [
        {"agent_address": h1["agent_address"], "expect_revert": None, "expected_payout_wei": "600000000000000"},
        {"agent_address": h2["agent_address"], "expect_revert": None, "expected_payout_wei": "400000000000000"},
        {"agent_address": h3["agent_address"], "expect_revert": "bet did not win", "expected_payout_wei": None},
    ],
})

# 9. Sole-side winners: every bettor is on the winning side, so each gets back
#    exactly their own stake (winningPool == totalPool, no losing pool to redistribute).
i1 = attestation(14, 14, BULL, 300_000_000_000_000, 1)
i2 = attestation(15, 15, BULL, 300_000_000_000_000, 2)
i3 = attestation(16, 16, BULL, 400_000_000_000_000, 3)
cases.append({
    "case_id": "09_sole_side_full_refund",
    "description": "All three agents bet BULL, and BULL wins; no BEAR pool exists, so "
                    "each winner's payout equals exactly their own stake.",
    "attestations": [i1, i2, i3],
    "place_call_time": 1_000_000,
    "market_close_time": 1_010_000,
    "expect_place_revert": [None, None, None],
    "settle": {"open_price": 100, "close_price": 200},
    "claims": [
        {"agent_address": i1["agent_address"], "expect_revert": None, "expected_payout_wei": "300000000000000"},
        {"agent_address": i2["agent_address"], "expect_revert": None, "expected_payout_wei": "300000000000000"},
        {"agent_address": i3["agent_address"], "expect_revert": None, "expected_payout_wei": "400000000000000"},
    ],
})

output = {
    "_meta": {
        "title": "Independent Reference Model Testing — AgentStockMarket.sol test vectors",
        "relayer_address": RELAYER_ADDRESS,
        "relayer_private_key": RELAYER_PRIVATE_KEY,
        "wrong_signer_address": WRONG_SIGNER_ADDRESS,
        "wrong_signer_private_key": WRONG_SIGNER_PRIVATE_KEY,
        "key_disclaimer": "TEST-ONLY ephemeral relayer key, generated fresh via `cast "
                           "wallet new` for this verification task only. This is NOT "
                           "the production relayer identity and must never be reused "
                           "outside this test suite.",
        "max_bet_size_wei": MAX_BET_SIZE_WEI,
        "note": "Every attestation's `signature` field here is a convenience for "
                "readers of this file only. verification/reference_model.py and "
                "test/AgentStockMarket.t.sol each independently recompute "
                "attestation_hash() from the raw fields and treat (v, r, s) as an "
                "opaque signature to verify, not a precomputed truth to trust.",
    },
    "cases": cases,
}

out_path = Path(__file__).parent / "test_vectors.json"
out_path.write_text(json.dumps(output, indent=2) + "\n")
print(f"wrote {out_path} ({len(cases)} cases)")
