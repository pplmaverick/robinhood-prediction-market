import json
import sys
sys.path.insert(0, "verification/settlement")
from reference_model import determine_winner, compute_payout, Direction

with open("verification/settlement/raw_data/markets_joined.json") as f:
    markets = json.load(f)
with open("verification/settlement/raw_data/feed_config.json") as f:
    feed_config = json.load(f)

settle_cases = [m for m in markets if "closePrice" in m]

test_cases = {"settleMarket": [], "claimWinnings": []}
report_rows = []

for m in settle_cases:
    sym = m["symbol"]
    feed = feed_config[sym]
    case = {
        "marketId": m["marketId"],
        "symbol": sym,
        "priceFeed": m["priceFeed"],
        "underlyingAggregator": feed["aggregator"],
        "feedDecimals": feed["decimals"],
        "feedMaxStalenessSeconds": feed["maxStaleness"],
        "openPrice": m["openPrice"],
        "closePrice": m["closePrice"],
        "lockBlock": m["lockBlock"],
        "settleBlock": m["settleBlock"],
        "settleTimestamp": m["settleTimestamp"],
        "settleTxHash": m["settleTxHash"],
        "actualWinner": m["winner"],
    }
    modeled_winner = int(determine_winner(m["openPrice"], m["closePrice"]))
    case["modeledWinner"] = modeled_winner
    case["pass"] = (modeled_winner == m["winner"])
    test_cases["settleMarket"].append(case)
    report_rows.append((m["marketId"], sym, m["openPrice"], m["closePrice"],
                         m["winner"], modeled_winner, case["pass"],
                         m["openPrice"] == m["closePrice"]))

# claimWinnings case(s)
for m in settle_cases:
    if "claims" not in m:
        continue
    bull_pool = sum(b["amount"] for b in m.get("bets", []) if b["direction"] == 0)
    bear_pool = sum(b["amount"] for b in m.get("bets", []) if b["direction"] == 1)
    for claim in m["claims"]:
        bettor_bet = next(b for b in m["bets"] if b["user"] == claim["user"])
        winner = determine_winner(m["openPrice"], m["closePrice"])
        modeled_payout = compute_payout(bull_pool, bear_pool, winner, bettor_bet["amount"])
        case = {
            "marketId": m["marketId"],
            "symbol": m["symbol"],
            "user": claim["user"],
            "betDirection": bettor_bet["direction"],
            "betAmount": bettor_bet["amount"],
            "bullPool": bull_pool,
            "bearPool": bear_pool,
            "openPrice": m["openPrice"],
            "closePrice": m["closePrice"],
            "actualPayout": claim["amount"],
            "modeledPayout": modeled_payout,
            "pass": modeled_payout == claim["amount"],
            "claimTxHash": claim["txHash"],
        }
        test_cases["claimWinnings"].append(case)

with open("verification/settlement/test_cases.json", "w") as f:
    json.dump(test_cases, f, indent=2, sort_keys=True)

print(f"settleMarket cases: {len(test_cases['settleMarket'])}, all pass: {all(c['pass'] for c in test_cases['settleMarket'])}")
print(f"claimWinnings cases: {len(test_cases['claimWinnings'])}, all pass: {all(c['pass'] for c in test_cases['claimWinnings'])}")

fails = [c for c in test_cases["settleMarket"] if not c["pass"]] + [c for c in test_cases["claimWinnings"] if not c["pass"]]
print("FAILURES:", fails)

ties = [r for r in report_rows if r[7]]
print("tie cases (openPrice == closePrice):", ties)

for r in report_rows:
    print(r)
