"""
Independent Python reference model for the PriceRangeIndex rolling-window
computation, written to mirror subgraph/src/raw-aggregator-common.ts's
updatePriceRangeIndex() line for line, not derived from reading its output
values -- the same "predict from spec, don't fit to observed data"
discipline as verification/settlement/reference_model.py.

Formula choices (see docs/spec.md "PriceRangeIndex" for rationale):
  - window size N=20, incremental (push new price, shift oldest if > 20)
  - movingAverage = arithmetic mean of the window
  - volatility    = sample standard deviation, ddof=1
  - percentileRank = (count of window values <= currentPrice) / n * 100,
                      computed AFTER currentPrice is pushed into the window
  - n < 2: volatility defined as 0 (explicit convention, not derived)

Precision note (deliberately mirrors the AssemblyScript side's boundary,
not incidental): mean/variance/percentile are computed in exact decimal
arithmetic (Python's decimal.Decimal, high precision context) to match
graph-ts's BigDecimal, which is also exact decimal arithmetic. The single
exception is volatility's square root: graph-ts's BigDecimal has no sqrt(),
so the AssemblyScript handler converts variance to f64, calls Math.sqrt(),
and converts the result back to BigDecimal via a string round-trip. This
script reproduces that exact same float round-trip for volatility only --
using Decimal's own (arbitrary-precision) sqrt instead would silently stop
mirroring the system under test at exactly the one place most likely to
diverge.
"""
import json
import math
from decimal import Decimal, getcontext

getcontext().prec = 50

WINDOW_SIZE = 20
DECIMALS = 8

FEED_SYMBOLS = {
    "0x7a6b81ba7fbcb90104d8c496158cf383cd7233b1": "TSLA",
    "0x93503dfc97157cdb8aadccaf70452621d598fdeb": "AMZN",
    "0x315afd0f71d5407b99ad19ab001a67af40fbaaf4": "PLTR",
    "0xdad54b8ee51af258e5a6faa9a84a3300f4775f7d": "AMD",
    "0xc9d16e4f2569b9e3ea0468fd85844953713dc2a2": "NVDA",
}


def normalize(raw_current: str) -> Decimal:
    return Decimal(raw_current) / (Decimal(10) ** DECIMALS)


def compute_row(window: list[Decimal], current_price: Decimal) -> dict:
    n = len(window)
    actual_window_size = n
    is_full_window = n == WINDOW_SIZE

    moving_average = sum(window, Decimal(0)) / Decimal(n)

    if n < 2:
        volatility = Decimal(0)
    else:
        sum_sq_diff = sum(((x - moving_average) ** 2 for x in window), Decimal(0))
        variance = sum_sq_diff / Decimal(n - 1)
        # Deliberate float round-trip, mirroring graph-ts BigDecimal's lack
        # of sqrt() -- see module docstring.
        variance_f64 = float(variance)
        stddev_f64 = math.sqrt(variance_f64)
        volatility = Decimal(str(stddev_f64))

    count_le = sum(1 for x in window if x <= current_price)
    percentile_rank = (Decimal(count_le) / Decimal(n)) * Decimal(100)

    return {
        "currentPrice": current_price,
        "movingAverage": moving_average,
        "volatility": volatility,
        "percentileRank": percentile_rank,
        "actualWindowSize": actual_window_size,
        "isFullWindow": is_full_window,
    }


def run(answer_updateds: list[dict]) -> list[dict]:
    windows: dict[str, list[Decimal]] = {}
    results = []

    events_sorted = sorted(
        answer_updateds,
        key=lambda e: (int(e["blockNumber"]), e["transactionHash"]),
    )

    for event in events_sorted:
        feed = event["feedAddress"].lower()
        symbol = FEED_SYMBOLS[feed]
        price = normalize(event["current"])

        window = windows.setdefault(feed, [])
        window.append(price)
        if len(window) > WINDOW_SIZE:
            window.pop(0)

        row = compute_row(window, price)
        row["id"] = event["id"]
        row["feedAddress"] = feed
        row["symbol"] = symbol
        row["roundId"] = event["roundId"]
        row["blockNumber"] = event["blockNumber"]
        results.append(row)

    return results


def main():
    with open("raw_data/answer_updateds.json") as f:
        answer_updateds = json.load(f)

    results = run(answer_updateds)

    # JSON can't hold Decimal; serialize as strings for the output artifact.
    serializable = [
        {**r, "currentPrice": str(r["currentPrice"]), "movingAverage": str(r["movingAverage"]),
         "volatility": str(r["volatility"]), "percentileRank": str(r["percentileRank"])}
        for r in results
    ]
    with open("raw_data/python_price_range_index.json", "w") as f:
        json.dump(serializable, f, indent=2)

    print(f"computed {len(results)} rows")


if __name__ == "__main__":
    main()
