# Architectural Directive: Sponsor Selection and Differentiation Narrative

**Decision Date:** 2026-08-26 (sponsor selection) · 2026-09-03 (narrative correction, see Revision)

**Numbering note:** This file is numbered 06, after 04 and 05, purely by the order it was
written down (2026-09-05). The decisions it records predate both — 04 and 05 were made on
2026-09-05, while the decisions here happened 2026-08-26 and 2026-09-03. Read the Decision
Date above, not the file number, for the actual timeline.

## Decision Context (Human Architect)

ETHOnline 2026's officially confirmed sponsor list includes 1inch, Chainlink, Hedera,
Ledger, The Graph, Uniswap, World, and 0G. Competition rules cap entries at three Partner
Prize submissions. The project needed to decide which three sponsors to build against, and
what narrative ties the resulting integrations together rather than leaving them as three
unrelated add-ons.

## Core Directives Given to Claude Code

0G, 1inch, Uniswap, Hedera, Ledger, ENS, and Balancer were excluded from consideration —
each for its own reason (scenario mismatch with the project, integration details not yet
published, too few prize slots to justify the integration cost, etc.), not one blanket
reason applied across all of them. The three locked in:

- **Chainlink** — price data source.
- **The Graph** — x402 self-pay queries and historical indexing.
- **World AgentKit** — human-anchored verification.

These three were chosen specifically because they compose into one storyline — price feed
-> paid historical query -> human-backed execution — rather than standing as three
independent integrations bolted on to satisfy three separate prize tracks.

## Implementation & Trade-off Constraints

Locking to these three early forecloses adding a fourth Partner Prize track later without
unwinding this decision. The three were selected because the pipeline depends on all of
them together: dropping any one (e.g., swapping Chainlink for a different price oracle, or
The Graph for a different indexer) breaks the "price feed -> paid query -> human-backed
execution" narrative, not just one integration in isolation.

## Revision

**2026-09-03.** Competitive analysis surfaced that ETHGlobal Cannes 2026 finalist DIVE (an
AI swarm engine whose core innovation is multi-agent verification at the settlement layer)
had already claimed the "AI verifies truth" positioning. The human architect judged that the
project's original narrative plan — an AI advisor layered with RSI/MACD technical
indicators and sentiment analysis — is a standard pattern already common across the
Polymarket-style prediction-market ecosystem, without enough technical depth to
differentiate against DIVE or similar entrants at this event.

The narrative was corrected accordingly: verifiability is welded into the AI's output
itself — every decision is run against an independent Reference Model in parallel, and the
result is hashed and sealed together with its input data — rather than welded into the
testing process around the AI. This echoes DIVE's general direction (verification as a
first-class concern) without overlapping its specific mechanism (multi-agent consensus at
settlement). See [[07-autonomous-agent-architecture-correction]] for the architecture
change this narrative correction required downstream.
