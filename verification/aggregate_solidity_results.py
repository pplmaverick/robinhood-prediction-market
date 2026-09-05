"""
Independent Reference Model Testing — aggregation step (Phase 4 helper).

forge test isolates each test function's EVM/storage state (setUp() runs
before every test, and Foundry reverts to a fresh snapshot after each one),
so there is no in-EVM way for 9 independent test functions to accumulate into
one shared JSON array. Cheatcode file I/O is the one thing that survives
that per-test revert, so each test appends its own line to
solidity_actual_results.jsonl via vm.writeLine(); this script's only job is
to fold those lines into a single ordered JSON array file, matching
verification/test_vectors.json's case order, for compare_results.py to diff
against python_expected_results.json.
"""
import json
from pathlib import Path

here = Path(__file__).parent
jsonl_path = here / "solidity_actual_results.jsonl"
vectors_path = here / "test_vectors.json"
out_path = here / "solidity_actual_results.json"

case_order = [c["case_id"] for c in json.loads(vectors_path.read_text())["cases"]]

rows = {}
for line in jsonl_path.read_text().splitlines():
    line = line.strip()
    if not line:
        continue
    row = json.loads(line)
    rows[row["case_id"]] = row

missing = [c for c in case_order if c not in rows]
if missing:
    raise SystemExit(f"missing results for cases: {missing}")

ordered = [rows[c] for c in case_order]
out_path.write_text(json.dumps(ordered, indent=2) + "\n")
print(f"wrote {out_path} ({len(ordered)} cases)")
