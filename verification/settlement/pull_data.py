"""
Step 1 data-pull script. Pulls real on-chain history for the StockPredictionMarket
contract via direct JSON-RPC (Blockscout is Cloudflare-blocked). No mock data.
Writes raw intermediate artifacts to raw_data/ for inspection; final curated
test_cases.json is assembled separately after this is reviewed.
"""
import json
import time
from web3 import Web3

RPC = "https://rpc.mainnet.chain.robinhood.com"
CONTRACT = Web3.to_checksum_address("0x72DAb8B1B53b3CF028e9A0d1E21178981f264245")

w3 = Web3(Web3.HTTPProvider(RPC))
assert w3.is_connected()
assert w3.eth.chain_id == 4663

EVENT_SIGS = {
    "MarketCreated": "MarketCreated(uint256,string,address)",
    "BetPlaced": "BetPlaced(uint256,address,uint8,uint256)",
    "MarketLocked": "MarketLocked(uint256,int256)",
    "MarketSettled": "MarketSettled(uint256,int256,uint8)",
    "WinningsClaimed": "WinningsClaimed(uint256,address,uint256)",
}
TOPIC0_TO_NAME = {w3.keccak(text=sig).hex(): name for name, sig in EVENT_SIGS.items()}

FUNC_SIGS = {
    "createMarket": "createMarket(address,address,string,uint256)",
    "placeBet": "placeBet(uint256,uint8)",
    "lockMarket": "lockMarket(uint256)",
    "settleMarket": "settleMarket(uint256)",
    "claimWinnings": "claimWinnings(uint256)",
}
SELECTOR_TO_NAME = {w3.keccak(text=sig).hex()[:8]: name for name, sig in FUNC_SIGS.items()}

print("topic0 map:", json.dumps(TOPIC0_TO_NAME, indent=2))
print("selector map:", json.dumps(SELECTOR_TO_NAME, indent=2))

latest = w3.eth.block_number
print("latest block:", latest)

logs = w3.eth.get_logs({"fromBlock": 0, "toBlock": "latest", "address": CONTRACT})
print("total logs:", len(logs))

raw_logs = []
tx_hashes = set()
for lg in logs:
    topic0 = lg["topics"][0].hex()
    name = TOPIC0_TO_NAME.get(topic0, f"UNKNOWN:{topic0}")
    raw_logs.append({
        "event": name,
        "blockNumber": lg["blockNumber"],
        "txHash": lg["transactionHash"].hex(),
        "logIndex": lg["logIndex"],
        "topics": [t.hex() for t in lg["topics"]],
        "data": lg["data"].hex(),
    })
    tx_hashes.add(lg["transactionHash"].hex())

print("unique tx hashes from logs:", len(tx_hashes))

with open("verification/settlement/raw_data/logs.json", "w") as f:
    json.dump(raw_logs, f, indent=2)

# Pull tx + receipt + block for each unique tx hash
txs = {}
for i, txh in enumerate(sorted(tx_hashes)):
    tx = w3.eth.get_transaction(txh)
    receipt = w3.eth.get_transaction_receipt(txh)
    block = w3.eth.get_block(tx["blockNumber"])
    input_hex = tx["input"].hex()
    selector = input_hex[:8] if not input_hex.startswith("0x") else input_hex[2:10]
    method = SELECTOR_TO_NAME.get(selector, f"UNKNOWN:{selector}")
    txs[txh] = {
        "txHash": txh,
        "blockNumber": tx["blockNumber"],
        "timestamp": block["timestamp"],
        "from": tx["from"],
        "to": tx["to"],
        "input": input_hex if input_hex.startswith("0x") else "0x" + input_hex,
        "method": method,
        "status": receipt["status"],
        "gasUsed": receipt["gasUsed"],
    }
    if i % 10 == 0:
        print(f"  pulled {i+1}/{len(tx_hashes)}")

with open("verification/settlement/raw_data/txs.json", "w") as f:
    json.dump(txs, f, indent=2)

print("done. txs pulled:", len(txs))

# Method breakdown
from collections import Counter
method_counts = Counter(t["method"] for t in txs.values())
sender_counts = Counter(t["from"] for t in txs.values())
print("METHOD BREAKDOWN:", dict(method_counts))
print("SENDER BREAKDOWN:", dict(sender_counts))
