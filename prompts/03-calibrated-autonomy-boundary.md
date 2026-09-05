# Architectural Directive: Calibrated Autonomy Boundary

**Decision Date:** 2026-09-03

## Decision Context (Human Architect)

AI agents operating in on-chain financial contexts tend to fail in one of
two ways: fully autonomous with no accountability mechanism, or purely
advisory, which forfeits the value of automation in the first place. The
design draws the boundary at the point where funds actually leave the
wallet.

## Core Directives Given to Claude Code

- Information-gathering actions — querying Graph Subgraph historical
  data, paying for that access autonomously via x402 — require no
  per-action human approval. Fully autonomous.
- Fund-committing actions — executing `placeBet` — require a relayer to
  verify, via World Chain's AgentBook, that the agent wallet is backed by
  a real, verified human before the transaction proceeds.

## Implementation & Trade-off Constraints

The boundary is drawn specifically at fund custody, not at general agent
autonomy: informational/read actions stay fully autonomous to preserve
the value of automating them, while anything that commits funds requires
the human-verification gate.

## Revision

The first draft of this design equated "World ID verifies a real human"
with "accountability is preserved." That reasoning had a gap, identified
after the fact: World ID proves *uniqueness* — that this agent maps to
one distinct real human — not *authorization scope* (whether that person
consented to this specific spend, or to what limit) and not a post-hoc
*traceable chain of responsibility*.

The corrected framing explicitly acknowledges that the current mechanism
solves only half the problem — blocking agent bets with no real human
behind them at all — and does not yet cover spend limits, a record of
authorization scope, or post-hoc accountability. This gap is disclosed
proactively in the README's Honest Disclosure section, rather than
presented as a complete accountability solution.
