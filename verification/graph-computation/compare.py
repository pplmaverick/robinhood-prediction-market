"""
Row-by-row comparison of the subgraph's AssemblyScript-computed
PriceRangeIndex output against the independent Python reference model's
output on the same 89 real on-chain AnswerUpdated events.

Tolerance policy (disclosed, not tuned to force a pass): currentPrice,
actualWindowSize, and isFullWindow must match exactly -- there is no
legitimate source of divergence for these (currentPrice is a single exact
decimal division; the other two are integers/booleans). movingAverage,
volatility, and percentileRank are compared with an absolute tolerance of
1e-9: these three involve division by window sizes that don't always
divide evenly (e.g. n=9, 13, 19), so graph-node's internal BigDecimal
precision and Python's decimal.Decimal(prec=50) can legitimately differ in
far-tail digits without either side being wrong. volatility additionally
inherits the deliberate float64 sqrt round-trip on both sides (see
reference_model.py docstring). Any diff at or above 1e-9 is treated as a
real mismatch, not rounded away.

If any row does not match, this script stops and prints the first
mismatch in full rather than silently continuing -- per this repo's
Independent Reference Model Testing discipline (see prompts/ ADRs and
verification/settlement/).
"""
import hashlib
import json
from decimal import Decimal

TOLERANCE = Decimal("1e-9")

EXACT_FIELDS = ["actualWindowSize", "isFullWindow"]
DECIMAL_EXACT_FIELDS = ["currentPrice"]
DECIMAL_TOLERANT_FIELDS = ["movingAverage", "volatility", "percentileRank"]


def load(path):
    with open(path) as f:
        return json.load(f)


def index_by_id(rows):
    return {r["id"]: r for r in rows}


def compare_row(subgraph_row, python_row):
    diffs = []
    for field in EXACT_FIELDS:
        if subgraph_row[field] != python_row[field]:
            diffs.append(f"{field}: subgraph={subgraph_row[field]!r} python={python_row[field]!r}")
    for field in DECIMAL_EXACT_FIELDS:
        a, b = Decimal(subgraph_row[field]), Decimal(python_row[field])
        if a != b:
            diffs.append(f"{field}: subgraph={a} python={b} diff={a - b}")
    for field in DECIMAL_TOLERANT_FIELDS:
        a, b = Decimal(subgraph_row[field]), Decimal(python_row[field])
        diff = abs(a - b)
        if diff >= TOLERANCE:
            diffs.append(f"{field}: subgraph={a} python={b} diff={diff} (>= tolerance {TOLERANCE})")
    return diffs


def main():
    subgraph_rows = load("raw_data/subgraph_price_range_index.json")
    python_rows = load("raw_data/python_price_range_index.json")

    subgraph_by_id = index_by_id(subgraph_rows)
    python_by_id = index_by_id(python_rows)

    assert set(subgraph_by_id.keys()) == set(python_by_id.keys()), (
        f"id sets differ: subgraph has {len(subgraph_by_id)}, python has {len(python_by_id)}, "
        f"symmetric diff = {set(subgraph_by_id) ^ set(python_by_id)}"
    )

    report_lines = []
    max_diffs = {f: Decimal(0) for f in DECIMAL_EXACT_FIELDS + DECIMAL_TOLERANT_FIELDS}
    mismatches = []

    ordered_ids = sorted(subgraph_by_id.keys(), key=lambda i: int(subgraph_by_id[i]["blockNumber"]))

    for row_id in ordered_ids:
        sg = subgraph_by_id[row_id]
        py = python_by_id[row_id]
        diffs = compare_row(sg, py)
        symbol = sg["symbol"]
        block = sg["blockNumber"]
        status = "MATCH" if not diffs else "MISMATCH"
        report_lines.append(
            f"[{status}] {symbol} block={block} round={sg['roundId']} "
            f"n={sg['actualWindowSize']} full={sg['isFullWindow']} "
            f"price={sg['currentPrice']} mean={sg['movingAverage']} "
            f"vol={sg['volatility']} pct={sg['percentileRank']}"
        )
        for f in DECIMAL_EXACT_FIELDS + DECIMAL_TOLERANT_FIELDS:
            d = abs(Decimal(sg[f]) - Decimal(py[f]))
            if d > max_diffs[f]:
                max_diffs[f] = d
        if diffs:
            mismatches.append((row_id, sg, py, diffs))

    total = len(ordered_ids)
    matched = total - len(mismatches)

    summary = [
        f"# PriceRangeIndex Independent Reference Model Comparison",
        f"",
        f"Total rows compared: {total}",
        f"Matched (within tolerance policy above): {matched}/{total}",
        f"Mismatched: {len(mismatches)}/{total}",
        f"",
        f"Max observed absolute diff per field (0 = bit-for-bit identical):",
    ]
    for f, d in max_diffs.items():
        summary.append(f"  - {f}: {d}")
    summary.append("")

    if mismatches:
        summary.append("## Mismatches (first stops here per Independent Reference Model discipline)")
        for row_id, sg, py, diffs in mismatches[:5]:
            summary.append(f"\nid={row_id}")
            summary.append(f"  subgraph: {sg}")
            summary.append(f"  python:   {py}")
            for d in diffs:
                summary.append(f"  DIFF: {d}")

    summary.append("\n## Per-row trace\n")
    summary.extend(report_lines)

    report_text = "\n".join(summary) + "\n"
    with open("comparison_report.md", "w") as f:
        f.write(report_text)

    # Seal the full trace (subgraph output + python output + report) with SHA-256.
    trace_blob = json.dumps(
        {"subgraph": subgraph_rows, "python": python_rows}, sort_keys=True
    ).encode()
    trace_hash = hashlib.sha256(trace_blob).hexdigest()
    report_hash = hashlib.sha256(report_text.encode()).hexdigest()

    with open("commitments.sha256", "w") as f:
        f.write(f"trace_sha256={trace_hash}\n")
        f.write(f"comparison_report_sha256={report_hash}\n")

    print(f"Matched {matched}/{total} rows (tolerance {TOLERANCE} on movingAverage/volatility/percentileRank)")
    print("Max diffs:", {k: str(v) for k, v in max_diffs.items()})
    print(f"trace_sha256={trace_hash}")
    if mismatches:
        print(f"\n{len(mismatches)} MISMATCHES FOUND -- see comparison_report.md")


if __name__ == "__main__":
    main()
