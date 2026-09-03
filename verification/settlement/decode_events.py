import json
from web3 import Web3
from eth_abi import decode as abi_decode

w3 = Web3()

with open("verification/settlement/raw_data/logs.json") as f:
    raw_logs = json.load(f)
with open("verification/settlement/raw_data/txs.json") as f:
    txs = json.load(f)

def to_bytes(hexstr):
    if hexstr.startswith("0x"):
        hexstr = hexstr[2:]
    return bytes.fromhex(hexstr)

decoded_events = []
for lg in raw_logs:
    ev = lg["event"]
    topics = lg["topics"]
    data = to_bytes(lg["data"])
    marketId = int(topics[1], 16)
    rec = {"event": ev, "txHash": lg["txHash"], "blockNumber": lg["blockNumber"], "marketId": marketId}
    if ev == "MarketCreated":
        symbol, stockToken = abi_decode(["string", "address"], data)
        rec["symbol"] = symbol
        rec["stockToken"] = stockToken
    elif ev == "BetPlaced":
        user = "0x" + topics[2][-40:]
        direction, amount = abi_decode(["uint8", "uint256"], data)
        rec["user"] = Web3.to_checksum_address(user)
        rec["direction"] = direction
        rec["amount"] = amount
    elif ev == "MarketLocked":
        (openPrice,) = abi_decode(["int256"], data)
        rec["openPrice"] = openPrice
    elif ev == "MarketSettled":
        closePrice, winner = abi_decode(["int256", "uint8"], data)
        rec["closePrice"] = closePrice
        rec["winner"] = winner
    elif ev == "WinningsClaimed":
        user = "0x" + topics[2][-40:]
        (amount,) = abi_decode(["uint256"], data)
        rec["user"] = Web3.to_checksum_address(user)
        rec["amount"] = amount
    tx = txs[lg["txHash"]]
    rec["timestamp"] = tx["timestamp"]
    rec["from"] = tx["from"]
    decoded_events.append(rec)

with open("verification/settlement/raw_data/decoded_events.json", "w") as f:
    json.dump(decoded_events, f, indent=2)

# Decode createMarket calldata to get priceFeed address (not in the event)
create_calls = {}
for txh, tx in txs.items():
    if tx["method"] != "createMarket":
        continue
    input_hex = tx["input"]
    calldata = to_bytes(input_hex)[4:]  # strip selector
    stockToken, priceFeed, symbol, duration = abi_decode(
        ["address", "address", "string", "uint256"], calldata
    )
    create_calls[txh] = {
        "stockToken": stockToken,
        "priceFeed": priceFeed,
        "symbol": symbol,
        "duration": duration,
    }

with open("verification/settlement/raw_data/create_calls.json", "w") as f:
    json.dump(create_calls, f, indent=2)

print("decoded events:", len(decoded_events))
print("createMarket calls decoded:", len(create_calls))
for txh, c in create_calls.items():
    print(" ", txh[:12], c["symbol"], "priceFeed=", c["priceFeed"], "duration=", c["duration"])
