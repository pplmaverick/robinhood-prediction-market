# Architectural Directive: Indexing Infrastructure Choice

**Decision Date:** 2026-09-05

## Decision Context (Human Architect)

Direction One requires an indexing layer capable of querying historical
Chainlink round data for the rolling-window computation layer. This
decision covers which indexing infrastructure to build on: The Graph's
official decentralized network (Subgraph Studio) versus a self-hosted
`graph-node`.

## Core Directives Given to Claude Code

Do not pick one of the two available paths and commit development time to
it on assumption alone. Run both through a small, strictly time-boxed
feasibility check first — 30 minutes for Subgraph Studio, 45 minutes for a
self-hosted `graph-node` — and report back with concrete evidence before
either is adopted as the path forward.

## Implementation & Trade-off Constraints

Both paths proved technically viable within their time boxes. Self-hosted
`graph-node` was selected to build on first: it was already fully verified
end-to-end (a real subgraph deployed, real on-chain data queryable) at
decision time, while Subgraph Studio requires a one-time browser-based
wallet sign-in that only the human architect can perform — a manual
dependency, not a technical blocker. Studio remains an open, available
path to add later, not one ruled out on feasibility grounds.

## Revision

The original plan to build a self-hosted `graph-node` was set *before*
this feasibility check, based on a misreading of The Graph's open-source
`networks-registry`: its `services.subgraphs` field for Robinhood Chain
was an empty array, read at the time as "no indexer supports this chain."
That reading was wrong. Direct verification against `thegraph.com/docs`'s
own supported-networks page, corroborated by three independent
third-party indexers (Goldsky, Ormi, Envio) publicly advertising Robinhood
Chain support, showed the chain is officially supported. The empty array
was a stale snapshot in a community-maintained catalog, not an
authoritative statement that no indexer exists. The self-hosted path was
still chosen in the end, but for the time-cost reason stated above — not
because the original risk that motivated it turned out to be real.
