# Architectural Directive: Genesis Decimals Finding Disposition

**Decision Date:** 2026-09-03

## Decision Context (Human Architect)

Independent Reference Model Testing of `settleMarket()`/`claimWinnings()`
surfaced two architectural gaps in the existing, deployed contract:

- **Finding 1**: The price-read path performs no decimals normalization.
  Currently inert — none of the 5 feeds' underlying aggregators has ever
  been swapped since deployment — but the gap itself is real and
  unmitigated.
- **Finding 4**: The README claims a "no winner, full refund" behavior,
  but `claimWinnings()` has no corresponding code path. If a market's
  winning side ever receives zero bets, the losing side's stake would be
  permanently stranded with no refund mechanism. Not triggered by any of
  the 27 real historical `settleMarket` transactions to date.

## Core Directives Given to Claude Code

- Do not modify the deployed mainnet contract for either finding during
  any hackathon window.
- Record Finding 1 as a documented, known limitation, with no fix
  currently scheduled.
- Schedule a fix for Finding 4 during the Arbitrum Open House Singapore
  buildathon (2026-09-14 to 2026-10-04).
- Disclose both findings proactively and honestly in submission
  documentation — do not wait for judges to discover them independently.

## Implementation & Trade-off Constraints

- Mainnet contracts should not be redeployed on short notice: redeployment
  is costly, and — just as importantly — it decouples the contract from
  its existing, already-verified on-chain transaction history (the 27
  real `settleMarket` cases and 1 real `claimWinnings` case the reference
  model was independently verified against).
- Finding 4 is real but not an active incident: it has never been
  triggered across real usage to date, so it does not warrant an
  emergency fix under hackathon time pressure.
- The Arbitrum Open House Singapore buildathon is the natural point to
  address it instead: that event already involves shipping new
  functionality (the AI Agent layer), which gives a natural "v2
  deployment" moment to fold the fix into, and its three-week duration is
  enough runway to do it properly — fix the logic, add test coverage,
  deploy, and re-verify — rather than rushing a mainnet change in a
  compressed window.
