"""
Pulls the real on-chain input (AnswerUpdated events) and the subgraph's own
computed output (PriceRangeIndex) from the running self-hosted graph-node,
via its public GraphQL query endpoint. Saves both to raw_data/ as the fixed
inputs for reference_model.py and compare.py.

Independent Reference Model Testing methodology (see prompts/ ADRs):
this script only reads from the deployed subgraph's query API -- it does
not touch the subgraph's mapping/handler source code, so the data it
fetches is a black-box observation of what the AssemblyScript handler
actually produced, not a copy of its logic.

Endpoint is behind an nginx Basic Auth gate (see docs/spec.md "Indexing
infrastructure" section for why). Credentials are read from environment
variables, never hardcoded here -- this file is committed to a public
hackathon submission repo.
"""
import base64
import json
import os
import urllib.request

ENDPOINT = "http://46.62.246.244:8000/subgraphs/id/QmSBoAQ1in9hehDCBmtP55zu7kocEn5LDcAWHgJzMs1qhX"


def _auth_header() -> str:
    user = os.environ.get("GRAPH_NODE_USER")
    password = os.environ.get("GRAPH_NODE_PASSWORD")
    if not user or not password:
        raise RuntimeError(
            "Set GRAPH_NODE_USER and GRAPH_NODE_PASSWORD env vars "
            "(the graph-node GraphQL endpoint is behind Basic Auth)"
        )
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def query(gql: str) -> dict:
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({"query": gql}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": _auth_header(),
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
    if "errors" in body:
        raise RuntimeError(body["errors"])
    return body["data"]


def main():
    answer_updateds = query(
        """
        { answerUpdateds(first: 1000, orderBy: blockNumber, orderDirection: asc) {
            id feedAddress current roundId updatedAt blockNumber blockTimestamp transactionHash
        } }
        """
    )["answerUpdateds"]

    price_range_indexes = query(
        """
        { priceRangeIndexes(first: 1000, orderBy: blockNumber, orderDirection: asc) {
            id feedAddress symbol roundId currentPrice movingAverage volatility
            percentileRank actualWindowSize isFullWindow blockNumber blockTimestamp transactionHash
        } }
        """
    )["priceRangeIndexes"]

    with open("raw_data/answer_updateds.json", "w") as f:
        json.dump(answer_updateds, f, indent=2)
    with open("raw_data/subgraph_price_range_index.json", "w") as f:
        json.dump(price_range_indexes, f, indent=2)

    print(f"answerUpdateds: {len(answer_updateds)}")
    print(f"priceRangeIndexes: {len(price_range_indexes)}")


if __name__ == "__main__":
    main()
