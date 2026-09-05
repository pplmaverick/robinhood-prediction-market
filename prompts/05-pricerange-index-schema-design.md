# Architectural Directive: PriceRangeIndex Schema Design

**Decision Date:** 2026-09-05

## Decision Context (Human Architect)

The rolling-window computation layer (`PriceRangeIndex`) needs to
maintain, per Chainlink feed, a moving average, volatility, and
percentile rank over the last N=20 rounds, and must support row-by-row
verification against an independent Python reference model.

## Core Directives Given to Claude Code

1. Split the design into two entities: `FeedWindow` (mutable, purely
   holds the rolling-window state array, overwritten on every event) and
   `PriceRangeIndex` (immutable, one snapshot per event, the entity
   compared against the reference model) — because a single entity
   cannot simultaneously satisfy "mutable current state" and "immutable
   per-event historical record," which are mutually exclusive data
   lifecycle requirements.
2. Define `percentileRank` as an inclusive count (including the value
   itself) divided by `actualWindowSize`, explicitly acknowledged as one
   reasonable convention among several — chosen because it has no
   tie-handling ambiguity, not because it is claimed to be the single
   standard approach.
3. Use sample standard deviation (ddof=1) for `volatility`, on the
   grounds that the window represents a sample of a continuous price
   process rather than a full population enumeration, and because it
   matches `numpy.std(ddof=1)`/pandas' default, letting a reader
   spot-check with standard tooling.
4. When the window has fewer than 20 samples (e.g. AMZN at 9/20, NVDA at
   13/20), do not pretend the window is full — honestly record
   `actualWindowSize` and `isFullWindow`, and compute against whatever
   sample size is actually available.

## Implementation & Trade-off Constraints

The two-entity split costs one extra mutable-state write per event, in
exchange for a clean, queryable historical record that a single
mutable-only design could not provide. The ddof=1 choice is a one-line
difference from population standard deviation, but it must stay
identical across both the AssemblyScript handler and the Python
reference model, or their outputs would silently diverge on every
computation. The inclusive percentile convention trades "the one
universally standard definition" (which does not exist) for "zero
ambiguity on ties" — this is disclosed as a choice, not presented as the
only correct approach.

## Revision

A boundary case surfaced during implementation, not planned by the human
architect in advance: AssemblyScript's `BigDecimal` type (via
`graph-ts`) has no `sqrt()` method. This was reported during
implementation, and the human architect confirmed the resolution:
compute variance in exact `BigDecimal` arithmetic, and only round-trip
through `f64` for the final square-root step. The Python reference model
was required to reproduce that exact same round-trip — rather than take
`Decimal`'s own more precise native path — so that both sides stay
symmetric at the one step where floating-point precision is most
fragile. Asymmetry there would have produced an unexplained divergence
at the hardest point in the pipeline to debug.
