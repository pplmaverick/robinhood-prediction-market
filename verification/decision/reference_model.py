"""
Independent Python reference model for the decision engine's Step 1 (query decision) and
Step 2 (bet decision) logic, written to mirror decision-engine/src/{query-decision,
bet-decision}.js line for line -- same "predict from spec, don't fit to observed data"
discipline as verification/settlement/reference_model.py and
verification/graph-computation/reference_model.py.

Step 3 (relayer attestation) is deliberately NOT mirrored here. It makes live network calls
(AgentKit signature verification's own RPC check, AgentBook's RPC read on World Chain) --
there is nothing deterministic to reference-model, and reproducing it here would just be a
second copy of live network code, not an independent check of decision logic. See
run_typescript.mjs's module docstring for the same point from the TypeScript side.

Thresholds (must match decision-engine/src/config.js exactly):
  - PERCENTILE_HIGH_THRESHOLD = 80, PERCENTILE_LOW_THRESHOLD = 20
  - VOLATILITY_ANOMALY_RATIO = 1.5
  - QUERY_THROTTLE_MS = 5 * 60 * 1000

Signal direction is momentum/continuation, not mean-reversion -- see docs/spec.md, "Decision
engine signal direction," for the full disclosure of why this was chosen over the equally
reasonable mean-reversion reading.
"""
import json

PERCENTILE_HIGH_THRESHOLD = 80
PERCENTILE_LOW_THRESHOLD = 20
VOLATILITY_ANOMALY_RATIO = 1.5
QUERY_THROTTLE_MS = 5 * 60 * 1000


def classify_level(percentile_rank: float) -> str:
    if percentile_rank >= PERCENTILE_HIGH_THRESHOLD:
        return "HIGH"
    if percentile_rank <= PERCENTILE_LOW_THRESHOLD:
        return "LOW"
    return "NEUTRAL"


def classify_trend(current_moving_average: float, previous_moving_average) -> str:
    if previous_moving_average is None:
        return "UNKNOWN"
    if current_moving_average > previous_moving_average:
        return "UP"
    if current_moving_average < previous_moving_average:
        return "DOWN"
    return "FLAT"


def extremity_score(percentile_rank: float) -> float:
    return min(1.0, abs(percentile_rank - 50) / 50)


def make_bet_decision(current: dict, previous: dict | None) -> dict:
    level = classify_level(current["percentileRank"])
    trend = classify_trend(current["movingAverage"], previous["movingAverage"] if previous else None)

    decision = "NO_TRADE"
    if level == "HIGH" and trend == "UP":
        decision = "BULL"
    elif level == "LOW" and trend == "DOWN":
        decision = "BEAR"

    confidence = 0.0 if decision == "NO_TRADE" else extremity_score(current["percentileRank"])

    return {"decision": decision, "confidence": confidence, "level": level, "trend": trend}


def should_query(current_volatility: float, historical_avg_volatility, ms_since_last_query) -> dict:
    is_anomalous = (
        historical_avg_volatility is not None
        and historical_avg_volatility > 0
        and current_volatility >= VOLATILITY_ANOMALY_RATIO * historical_avg_volatility
    )
    is_throttled = ms_since_last_query is not None and ms_since_last_query < QUERY_THROTTLE_MS

    if not is_anomalous:
        return {"shouldQuery": False, "reason": "volatility_not_anomalous"}
    if is_throttled:
        return {"shouldQuery": False, "reason": "throttled"}
    return {"shouldQuery": True, "reason": "volatility_anomalous_and_not_throttled"}


def run(rows: list[dict]) -> list[dict]:
    rows_sorted = sorted(rows, key=lambda r: int(r["blockNumber"]))

    last_row_by_symbol: dict[str, dict] = {}
    vol_sum_by_symbol: dict[str, float] = {}
    vol_count_by_symbol: dict[str, int] = {}
    last_query_flag_ts_by_symbol: dict[str, int] = {}

    results = []
    for raw in rows_sorted:
        symbol = raw["symbol"]
        current = {
            "symbol": symbol,
            "movingAverage": float(raw["movingAverage"]),
            "volatility": float(raw["volatility"]),
            "percentileRank": float(raw["percentileRank"]),
        }
        previous = last_row_by_symbol.get(symbol)

        vol_count = vol_count_by_symbol.get(symbol, 0)
        vol_sum = vol_sum_by_symbol.get(symbol, 0.0)
        historical_avg_volatility = (vol_sum / vol_count) if vol_count > 0 else None

        last_flag_ts = last_query_flag_ts_by_symbol.get(symbol)
        ms_since_last_query = (
            (int(raw["blockTimestamp"]) - last_flag_ts) * 1000 if last_flag_ts is not None else None
        )

        query_decision = should_query(current["volatility"], historical_avg_volatility, ms_since_last_query)
        if query_decision["shouldQuery"]:
            last_query_flag_ts_by_symbol[symbol] = int(raw["blockTimestamp"])

        bet_decision = make_bet_decision(current, previous)

        results.append(
            {
                "blockNumber": raw["blockNumber"],
                "symbol": symbol,
                "shouldQuery": query_decision["shouldQuery"],
                "queryReason": query_decision["reason"],
                "decision": bet_decision["decision"],
                "confidence": bet_decision["confidence"],
                "level": bet_decision["level"],
                "trend": bet_decision["trend"],
            }
        )

        last_row_by_symbol[symbol] = current
        vol_sum_by_symbol[symbol] = vol_sum + current["volatility"]
        vol_count_by_symbol[symbol] = vol_count + 1

    return results


def main():
    with open("raw_data/price_range_index.json") as f:
        rows = json.load(f)

    results = run(rows)

    with open("raw_data/python_pure_decisions.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"computed {len(results)} rows")


if __name__ == "__main__":
    main()
