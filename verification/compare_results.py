"""
Independent Reference Model Testing — comparison (Phase 5).

Diffs verification/python_expected_results.json (Python's independent
re-derivation) against verification/solidity_actual_results.json (what the
actual AgentStockMarket.sol contract did, under forge test). Any mismatch is
printed in full detail and causes a non-zero exit — this never silently
passes a discrepancy through.

Address-keyed payout maps are compared case-insensitively: Solidity always
emits lowercase addresses, while Python's addresses come from
eth_utils.to_checksum_address() (mixed case per EIP-55). Same underlying
20-byte value, different string casing — normalized before comparison, not
before computing any hash (hashing already happened upstream on raw bytes,
which are case-independent).
"""
import json
import sys
from pathlib import Path

here = Path(__file__).parent


def normalize(value):
    """Recursively lowercase dict keys that look like 0x-addresses, and any
    plain string value (hashes, addresses) for case-insensitive comparison."""
    if isinstance(value, dict):
        return {
            (k.lower() if isinstance(k, str) and k.startswith("0x") else k): normalize(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, str) and value.startswith("0x"):
        return value.lower()
    return value


def main():
    python_path = here / "python_expected_results.json"
    solidity_path = here / "solidity_actual_results.json"

    python_results = {r["case_id"]: r for r in json.loads(python_path.read_text())}
    solidity_results = {r["case_id"]: r for r in json.loads(solidity_path.read_text())}

    all_case_ids = sorted(set(python_results) | set(solidity_results))
    mismatches = []

    for case_id in all_case_ids:
        py = python_results.get(case_id)
        sol = solidity_results.get(case_id)

        if py is None:
            mismatches.append((case_id, "present in solidity_actual_results.json but missing from python_expected_results.json", None, None))
            continue
        if sol is None:
            mismatches.append((case_id, "present in python_expected_results.json but missing from solidity_actual_results.json", None, None))
            continue

        for field in ("expected_hash", "expected_signer_valid", "expected_payout"):
            py_val = normalize(py.get(field))
            sol_val = normalize(sol.get(field))
            if py_val != sol_val:
                mismatches.append((case_id, field, py_val, sol_val))

    print(f"Compared {len(all_case_ids)} cases across python_expected_results.json and solidity_actual_results.json\n")

    if not mismatches:
        print("ALL CASES MATCH — Python reference model and Solidity contract agree on every field, every case.")
        return 0

    print(f"{len(mismatches)} MISMATCH(ES) FOUND:\n")
    for case_id, field, py_val, sol_val in mismatches:
        print(f"  case_id: {case_id}")
        print(f"    field: {field}")
        print(f"    python_expected : {py_val}")
        print(f"    solidity_actual : {sol_val}")
        print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
