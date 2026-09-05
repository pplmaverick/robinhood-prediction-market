# Architectural Directive: Merging Human and Agent Betting into a Single V2 Contract

Decision Date: 2026-09-06

## Decision Context (Human Architect)

ADR-09 chose an independent AgentStockMarket contract with its own bet pools, kept separate from the original StockPredictionMarket, to avoid touching a contract that appeared to be actively settling real markets. That decision is reversed here, now that two things are clearer than they were at the time of ADR-09.

On-chain verification of the two currently open markets (#27 TSLA, #28 AMZN) showed both bullPool and bearPool at exactly zero, confirmed by reading markets() directly rather than trusting the frontend display. Deprecating these two specific markets carries no risk to any real funds. A fuller scan of the contract's history did turn up genuine prior activity, though: market #5 had a real bet and a real claim (0.0049 ETH, claimed by the project's dev wallet, 0xed2B5717...), and market #14 had a real bet and, as of this decision, a real claim as well (0.00098 ETH, claimed by the architect's separate main wallet, 0x52905A5E..., tx 0xd4a60dd01f4dc7c38cd4ea9a6444483d8f3c9d810d7f3c7c1173d5dceecf5d6a). Both addresses belong to the project's architect. Neither market ever involved an external user, and with market #14 now claimed, the original contract requires no ongoing frontend for anyone to retrieve funds from it.

Keeping agent bets in an isolated pool also undercuts the project's own narrative. Calibrated Autonomy is about an AI agent participating in a real market alongside real human counterparties, not one where agents only ever bet against other agents. Folding agent bets into the same pool humans already bet into makes that story true instead of aspirational.

Nine days remained before the 9/14 deadline, enough to redo this properly and rerun Independent Reference Model Testing on the combined contract.

## Core Directives Given to Claude Code

Read all of the original StockPredictionMarket.sol before writing any new code, not just the parts ADR-09 already knew from its read-only view calls. Doing so surfaced two details that would otherwise have been guessed at: claimWinnings() deducts a 2% fee (FEE_BPS = 200) before paying out winners, which AgentStockMarket's claim function never replicated, and the contract's owner is a single address fixed permanently at deployment, with no transferOwnership() at all.

Build StockPredictionMarketV2 as the new primary contract. It carries over the full market lifecycle (createMarket, lockMarket, settleMarket) under the same owner-only access pattern as the original, not just the read-only view composability AgentStockMarket relied on. Human bets (placeBet, attributed by msg.sender) and agent bets (placeAgentBet, attributed by the attestation's signed agentAddress) write into the same bullPool, bearPool, and bets mapping, so one claimWinnings() function pays out both kinds of bettor from the same pool without needing to know which path they came in through.

Apply the one-bet-per-address-per-market rule to both paths equally. There's no product reason to let someone split a bet across multiple transactions on a two-outcome market, and ADR-09 already found that allowing it causes a real bug (a second bet silently overwrites the first bet's record while the pool total keeps growing). Apply the rule uniformly rather than only where the earlier bug happened to surface it.

Match the original contract's fee behavior exactly: 2% of each settled market's total pool, matching FEE_BPS = 200. Track it in an accumulatedFees variable, incremented per claim in proportion to that claim's share of the winning pool, instead of the original contract's behavior of leaving fee amounts as ETH stranded in the contract balance with no way to retrieve them. A new withdrawFees() function, restricted to the owner, actually lets that balance be collected. This closes a real gap found in the original contract: its balance of 0.00012 ETH, confirmed on-chain after both known claims, is entirely made up of these two markets' 2% fees, permanently stuck with no function able to move it.

Don't add a transferOwnership() function. The original contract never had one, and its single fixed owner hasn't caused any operational problems. Adding one now would add surface area with no concrete need behind it.

Reuse the already-deployed ChainlinkPriceFeed wrapper for each symbol instead of redeploying them. That wrapper's staleness and sanity checks have nothing to do with which prediction-market contract calls it.

Apply Independent Reference Model Testing in full to the new contract: both betting paths, the shared-pool payout math including the fee deduction, and the one-bet-per-address rule. Follow the same process as ADR-09: write the Python model independently, without reading the Solidity source, check its output field by field against Foundry test results, and seal all three artifacts with SHA-256.

## Implementation & Trade-off Constraints

Fees only become collectible once a winner actually calls claimWinnings(). A market whose winner never claims leaves its share of the fee stranded in the contract balance indefinitely, exactly as in the original contract. withdrawFees() only ever moves accumulatedFees, the amount already realized through actual claims, not a projection of fees owed on unclaimed pools.

The original StockPredictionMarket at 0x72DAb8B1B53b3CF028e9A0d1E21178981f264245 isn't being abandoned. It stays deployed and unmodified. With both of its historical bets now claimed and both currently open markets confirmed at zero bets, it requires no frontend, no further maintenance, and no migration of any kind — it simply stops being referenced by anything new.

maxAgentBetWei still applies only to the agent path. Humans stay uncapped, matching the original contract's behavior for placeBet(). This asymmetry is intentional: agent bets are constrained because they represent autonomous decisions that need a risk ceiling, while a human choosing their own bet size is their own responsibility.

usedAttestations[hash] becomes unreachable dead code on the placeAgentBet path for the same reason it did in AgentStockMarket under ADR-09: the one-bet-per-address-per-market check fires first and covers the same case. It stays in place as defense-in-depth in case that restriction is ever relaxed.
