# Architectural Directive: Attestation-Gated Agent Betting via Independent Contract

**Decision Date:** 2026-09-05

## Decision Context (Human Architect)

placeBet() needed a way to check that an AI agent's bet was backed by an attestation from the World AgentKit relayer, but nothing in the pipeline had ever called placeBet() with one. The relayer only produced and verified attestations off-chain (relayer.js's own header comment says as much: "It does NOT call placeBet() ... consuming the attestation on-chain is a separate, not-yet-built piece of work").

Two approaches were ruled out before this one. Modifying StockPredictionMarket.sol directly would mean redeploying a contract that is currently settling real markets (#20-24) on Robinhood Chain mainnet. A new contract address would break the frontend's .env.local and Vercel Production/Preview configuration, the same class of bug this project has already hit twice, and for no gain specific to agent betting.

Routing bets through a gate contract that calls the existing placeBet() internally was also ruled out. placeBet() has no access-control modifier and records the bettor by msg.sender. If a gate contract called it on an agent's behalf, the source contract would record the gate contract's own address as the bettor instead of the agent's, misattributing every bet and every later claim.

## Core Directives Given to Claude Code

Build AgentStockMarket.sol as a separate contract rather than touching or routing through StockPredictionMarket. It reads the source contract's markets() view for openTime, closeTime, openPrice, closePrice, and state, but never calls any function that changes the source contract's state and never requires any change to its deployed bytecode.

Bets are attributed to the agentAddress signed into the attestation, not to msg.sender. This is a deliberate meta-tx design: whoever submits the transaction, the agent itself or the relayer on its behalf, doesn't matter for fund ownership, since requiring msg.value to equal the attested amount removes any incentive for a third party to submit someone else's bet.

Signature verification uses raw secp256k1 with prehash set to false and no EIP-191 or EIP-712 wrapper, matching attestation.js's signRawHash() exactly. The signed hash covers agentAddress, humanId, marketId, direction, amount, robinhoodNonce, issuedAt, and expiresAt, in that order. Replay protection checks usedAttestations[hash] against the full attestation hash rather than relying on robinhoodNonce alone, since that nonce is just the block number at decision time and isn't strictly increasing per agent.

The tie-break rule (closePrice >= openPrice means BULL wins) mirrors the source contract's settleMarket() and claimWinnings() logic exactly, including the absence of any tie-refund path. This matches what the source contract's actual code does, not an assumption.

Independent Reference Model Testing was applied before deployment: a Python model, written independently from the Solidity source, re-implements the hashing, signature verification, and payout calculation, and its output was checked field by field against Foundry test results. The three artifacts (test_vectors.json, python_expected_results.json, solidity_actual_results.json) are sealed with SHA-256 in verification/commitments.sha256.

During this testing, one repeated-betting case surfaced a real gap: a second bet from the same agent on the same market would overwrite the first bet's record in agentBets while still adding to the pool total, permanently diluting other bettors' payouts with the overwritten amount going nowhere. The fix was to require agentBets[marketId][agentAddress].amount == 0 before accepting a bet, so each agent gets one bet per market.

The relayer's signing key was generated fresh and kept apart from the shared dev wallet (0xed2B5717...), so that if it leaks, the damage is limited to this contract's attestation trust rather than every chain the dev wallet touches.

## Implementation & Trade-off Constraints

A market that settles with closePrice equal to openPrice pays the full pool to BULL bettors, the same as the source contract does. There is no tie-refund mechanism, and this is disclosed rather than accidental.

maxBetSizeWei is set once at deployment as an immutable value, currently aligned with decision-engine's MAX_BET_SIZE_WEI of 0.001 ETH. The two aren't linked automatically; changing the env value later won't change the contract's cap without a redeploy.

usedAttestations[hash] can no longer be reached on the placeAgentBet path for an agent who has already bet on a market, because the newer one-bet-per-agent-per-market check fires first and covers the same case. It stays in place as a second layer of protection in case that restriction is ever relaxed.

agentBullPool and agentBearPool are tracked separately from the source contract's own bullPool and bearPool. This contract watches the same price event as the source market but doesn't share its liquidity, and the README needs to say so plainly, since it would otherwise look like a shared pool.

Deployment record, Robinhood Chain mainnet, chain ID 4663: contract at 0xE8b3916Ea16AD2F2C0910bB94005e30F5CC341D3, relayer at 0x67BBA560662eca86421BfD6Bb680ce228542defE (a separate key, not the shared dev wallet), source market at 0x72DAb8B1B53b3CF028e9A0d1E21178981f264245, deploy transaction 0x59657c48d3187d4e3d5eabe75b9b9e52b65cf94235f183d87a0b34b211f716d2. All three constructor values (relayerAddress, sourceMarket, maxBetSizeWei) were read back on-chain with cast call after deployment and matched what was intended, rather than trusting the deploy script alone.
