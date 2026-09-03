import json

with open("verification/settlement/raw_data/decoded_events.json") as f:
    events = json.load(f)
with open("verification/settlement/raw_data/create_calls.json") as f:
    create_calls = json.load(f)

by_market = {}
for ev in events:
    mid = ev["marketId"]
    by_market.setdefault(mid, {"marketId": mid, "events": []})
    by_market[mid]["events"].append(ev)

for ev in events:
    if ev["event"] != "MarketCreated":
        continue
    mid = ev["marketId"]
    m = by_market[mid]
    m["symbol"] = ev["symbol"]
    m["stockToken"] = ev["stockToken"]
    m["createTxHash"] = ev["txHash"]
    m["priceFeed"] = create_calls[ev["txHash"]]["priceFeed"]
    m["duration"] = create_calls[ev["txHash"]]["duration"]
    m["createBlock"] = ev["blockNumber"]
    m["createTimestamp"] = ev["timestamp"]

for ev in events:
    mid = ev["marketId"]
    m = by_market[mid]
    if ev["event"] == "MarketLocked":
        m["openPrice"] = ev["openPrice"]
        m["lockBlock"] = ev["blockNumber"]
        m["lockTimestamp"] = ev["timestamp"]
        m["lockTxHash"] = ev["txHash"]
    elif ev["event"] == "MarketSettled":
        m["closePrice"] = ev["closePrice"]
        m["winner"] = ev["winner"]  # 0=BULL 1=BEAR
        m["settleBlock"] = ev["blockNumber"]
        m["settleTimestamp"] = ev["timestamp"]
        m["settleTxHash"] = ev["txHash"]
    elif ev["event"] == "BetPlaced":
        m.setdefault("bets", []).append({
            "user": ev["user"], "direction": ev["direction"], "amount": ev["amount"], "txHash": ev["txHash"]
        })
    elif ev["event"] == "WinningsClaimed":
        m.setdefault("claims", []).append({
            "user": ev["user"], "amount": ev["amount"], "txHash": ev["txHash"]
        })

markets = sorted(by_market.values(), key=lambda m: m["marketId"])

settle_cases = [m for m in markets if "closePrice" in m]
claim_cases = [m for m in markets if "claims" in m]

print(f"total markets (createMarket count): {len(markets)}")
print(f"markets with settleMarket event (real count): {len(settle_cases)}")
print(f"markets with at least one claimWinnings event: {len(claim_cases)}")
print(f"markets locked but not settled: {sum(1 for m in markets if 'openPrice' in m and 'closePrice' not in m)}")
print(f"markets never locked: {sum(1 for m in markets if 'openPrice' not in m)}")

for m in markets:
    bp = len(m.get("bets", []))
    cl = len(m.get("claims", []))
    print(f"  market {m['marketId']:2d} {m.get('symbol','?'):5s} state={'SETTLED' if 'closePrice' in m else ('LOCKED' if 'openPrice' in m else 'OPEN')} bets={bp} claims={cl}")

with open("verification/settlement/raw_data/markets_joined.json", "w") as f:
    json.dump(markets, f, indent=2)
