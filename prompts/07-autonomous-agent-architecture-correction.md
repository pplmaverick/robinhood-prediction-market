# Architectural Directive: Autonomous Agent Architecture Correction

**Decision Date:** 2026-09-03

**Numbering note:** This file is numbered 07, after 04 and 05, purely by the order it was
written down (2026-09-05). The correction it records happened on 2026-09-03, before 04 and
05 (both 2026-09-05). Read the Decision Date above, not the file number, for the actual
timeline.

This ADR records a real mid-course correction as it actually happened, including the false
start — not a decision that was made correctly on the first attempt.

## Decision Context (Human Architect)

The original plan, set on 2026-08-26, positioned the AI as an **advisor**: human-in-the-loop,
requiring explicit human confirmation before `placeBet()` executes.

On 2026-09-03, the human architect identified a contradiction between that plan and two
other things the project had already committed to:

- World AgentKit's own track definition — "durable human-backed agent authorization for
  access, commerce, rate limits, trust, and continuity."
- The project's own relayer architecture, which gates `placeBet()` on attestation
  verification (see the relayer's trusted-signer bridge, added the same week).

The contradiction: if a human must still separately press a confirm button before every
bet, the human's real-time presence *is* the authorization — and World ID verification,
whose entire purpose is to prove a real human stands behind the agent, ends up doing no
actual work at the moment funds move. Human-in-the-loop confirmation and World ID
verification would both be solving the same problem twice, with the World ID layer left
unused for the one action (fund commitment) it exists to gate. The AgentKit track's core
value proposition would be hollowed out by keeping the advisor framing, even though the
relayer/attestation pipeline had already been built as if it *were* going to be the
authorization gate.

## Core Directives Given to Claude Code

Adopt **Option A**: the agent calls `placeBet()` autonomously; World ID verification (via
the relayer/AgentBook check) substitutes for real-time human confirmation as the
authorization gate.

Rejected: **Option B** — keep human-in-the-loop for the bet itself, and have World ID
verification gate some other, non-betting action instead.

Reasoning: Option A is the only one of the two that actually uses the AgentKit track's
value proposition, and it matches the project's "calibrated autonomy" narrative — the
agent's boundary sits at fund-execution, but that boundary is the World ID verification
gate, not a human re-pressing a button. This is the corrected boundary already reflected in
[[03-calibrated-autonomy-boundary]]; this ADR records how and why that correction happened.

## Implementation & Trade-off Constraints

Adopting Option A means the decision engine's bet path has no human-confirmation step to
fall back on — the relayer/AgentBook check is the only gate between a BULL/BEAR call and an
on-chain `placeBet()` call. There is no partial version of this: once the advisor UI's
confirm step is removed, correctness of the AgentBook check becomes the sole safeguard, which
is why the check's three-state read (`backed` / `unbacked` / `unknown`, never collapsing an
upstream failure into a false `unbacked` accusation) was treated as load-bearing rather than
incidental.

## Revision

A follow-up question from the human architect, asked immediately after Option A was
adopted, is recorded here because it is the direct origin of this task's risk-control
design, not a side remark:

> Is deciding a real-money bet on only two factors (volatility anomaly + query frequency)
> too thin?

Under the original advisor framing this would have been a lower-stakes question, since a
human still confirmed before money moved. Once Option A committed the engine to
autonomously executing real-money bets with no human confirmation step, the same two
factors could no longer be reused unmodified from where they originated — gating whether an
autonomous *data query* was worth issuing (`shouldQuery` in
`decision-engine/src/query-decision.js`), a low-stakes, reversible decision. The human
architect's judgment: a reversible-decision heuristic is not automatically adequate for an
irreversible one just because it is already implemented.

This is why the bet-decision layer (`decision-engine/src/bet-decision.js`) ended up
materially more complex than the query-decision layer:

- A hard cap, `MAX_BET_SIZE_WEI`, pinned to the deployed contract's own documented minimum
  bet rather than an invented figure.
- A `NO_TRADE` outcome as a first-class result, not just BULL/BEAR — used whenever signals
  are absent or contradictory, per the task's own framing that unclear or contradictory
  signals should default to no action rather than a guess.
- A multi-signal consistency gate (percentile-rank extremity *and* moving-average trend
  direction must agree) rather than a single-factor threshold — disagreement between the
  two is treated as an unclear signal and left as `NO_TRADE`, not flipped into the opposite
  call.
