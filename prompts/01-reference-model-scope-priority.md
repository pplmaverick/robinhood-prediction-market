# Architectural Directive: Reference Model Scope Priority

**Decision Date:** 2026-09-03

## Decision Context (Human Architect)

Direction Three (the full scope of the Graph computation layer, Direction
One) breaks into three sub-components:

1. **Rolling-window core logic** — AssemblyScript mapping handlers, the
   `PriceRangeIndex` entity, `BigDecimal` precision handling, incremental
   updates.
2. **Reference Model extension** — an independent Python verification of
   the Graph computation layer's own logic, mirroring the settlement
   verification already completed for `settleMarket()`/`claimWinnings()`.
3. **Full pipeline integration** — Chainlink → Graph → AI decision engine
   → Reference Model, recomputed and compared end-to-end.

Component (1) is the foundation. Components (2) and (3) cannot start
until (1) is complete.

## Core Directives Given to Claude Code

If hackathon-period time is insufficient to bring all three components to
full completeness, prioritize (1) completely — depth over breadth — even
at the cost of (2) and (3)'s completeness.

## Implementation & Trade-off Constraints

The risk between the two failure modes is asymmetric, not just a matter
of scope:

- An unsound (1) — mishandled incremental updates, incorrect
  `BigDecimal` precision — is exactly the kind of defect a judge can
  expose live, during a hands-on test or demo walkthrough. That damages
  the project's core narrative (rigorous, independently verified
  methodology) more than any other single failure could.
- An incomplete (3) only narrows the claimed scope. It can be disclosed
  honestly — "completed and verified; full end-to-end pipeline
  integration is the next step" — without reading as evasive or
  underprepared.

Given this asymmetry, (1) is treated as non-negotiable. (2) and (3) are
the first things scoped down if hackathon time runs short.
