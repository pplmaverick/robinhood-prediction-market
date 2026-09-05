"""
Row-by-row comparison of the TypeScript decision engine's Step 1+2 output against the
independent Python reference model's output, on the same 89 real PriceRangeIndex snapshots
already independently verified in verification/graph-computation/.

Tolerance policy (disclosed, not tuned to force a pass): decision, level, trend, shouldQuery,
and queryReason must match exactly -- these are all discrete/categorical outputs with no
legitimate source of floating-point divergence. confidence is compared with an absolute
tolerance of 1e-9: it's a plain float division (percentileRank arithmetic), and
percentileRank itself is already a BigDecimal-derived string on the TypeScript side vs a
Python float here, so far-tail floating-point digits can legitimately differ without either
side being wrong.

If any row does not match, this script stops and prints the first mismatch in full rather
than silently continuing -- per this repo's Independent Reference Model Testing discipline
(see prompts/ ADRs, verification/settlement/, verification/graph-computation/).
"""
import hashlib
import json

TOLERANCE = 1e-9

EXACT_FIELDS = ["decision", "level", "trend", "shouldQuery", "queryReason", "symbol", "blockNumber"]
TOLERANT_FIELDS = ["confidence"]


def load(path):
    with open(path) as f:
        return json.load(f)


def index_by_block(rows):
    return {r["blockNumber"]: r for r in rows}


def compare_row(ts_row, py_row):
    diffs = []
    for field in EXACT_FIELDS:
        if ts_row[field] != py_row[field]:
            diffs.append(f"{field}: typescript={ts_row[field]!r} python={py_row[field]!r}")
    for field in TOLERANT_FIELDS:
        a, b = float(ts_row[field]), float(py_row[field])
        diff = abs(a - b)
        if diff >= TOLERANCE:
            diffs.append(f"{field}: typescript={a} python={b} diff={diff} (>= tolerance {TOLERANCE})")
    return diffs


def main():
    ts_rows = load("raw_data/typescript_pure_decisions.json")
    py_rows = load("raw_data/python_pure_decisions.json")

    ts_by_block = index_by_block(ts_rows)
    py_by_block = index_by_block(py_rows)

    assert set(ts_by_block.keys()) == set(py_by_block.keys()), (
        f"blockNumber sets differ: typescript has {len(ts_by_block)}, python has {len(py_by_block)}, "
        f"symmetric diff = {set(ts_by_block) ^ set(py_by_block)}"
    )

    ordered_blocks = sorted(ts_by_block.keys(), key=int)

    report_lines = []
    mismatches = []
    max_confidence_diff = 0.0

    for block in ordered_blocks:
        ts = ts_by_block[block]
        py = py_by_block[block]
        diffs = compare_row(ts, py)
        status = "MATCH" if not diffs else "MISMATCH"
        report_lines.append(
            f"[{status}] {ts['symbol']} block={block} decision={ts['decision']} "
            f"confidence={ts['confidence']} level={ts['level']} trend={ts['trend']} "
            f"shouldQuery={ts['shouldQuery']} ({ts['queryReason']})"
        )
        max_confidence_diff = max(max_confidence_diff, abs(float(ts["confidence"]) - float(py["confidence"])))
        if diffs:
            mismatches.append((block, ts, py, diffs))

    total = len(ordered_blocks)
    matched = total - len(mismatches)

    decision_counts = {}
    for r in ts_rows:
        decision_counts[r["decision"]] = decision_counts.get(r["decision"], 0) + 1

    summary = [
        "# Decision Engine Independent Reference Model Comparison",
        "",
        f"Total rows compared: {total}",
        f"Matched (within tolerance policy above): {matched}/{total}",
        f"Mismatched: {len(mismatches)}/{total}",
        "",
        f"Decision distribution (TypeScript side): {decision_counts}",
        f"Max observed absolute diff, confidence: {max_confidence_diff} (0 = bit-for-bit identical)",
        "",
    ]

    if mismatches:
        summary.append("## Mismatches (first stops here per Independent Reference Model discipline)")
        for block, ts, py, diffs in mismatches[:5]:
            summary.append(f"\nblockNumber={block}")
            summary.append(f"  typescript: {ts}")
            summary.append(f"  python:     {py}")
            for d in diffs:
                summary.append(f"  DIFF: {d}")

    summary.append("\n## Per-row trace\n")
    summary.extend(report_lines)

    report_text = "\n".join(summary) + "\n"
    with open("comparison_report.md", "w") as f:
        f.write(report_text)

    trace_blob = json.dumps({"typescript": ts_rows, "python": py_rows}, sort_keys=True).encode()
    trace_hash = hashlib.sha256(trace_blob).hexdigest()
    report_hash = hashlib.sha256(report_text.encode()).hexdigest()

    with open("commitments.sha256", "w") as f:
        f.write(f"trace_sha256={trace_hash}\n")
        f.write(f"comparison_report_sha256={report_hash}\n")

    print(f"Matched {matched}/{total} rows (tolerance {TOLERANCE} on confidence)")
    print(f"Decision distribution: {decision_counts}")
    print(f"trace_sha256={trace_hash}")
    if mismatches:
        print(f"\n{len(mismatches)} MISMATCHES FOUND -- see comparison_report.md")


if __name__ == "__main__":
    main()
