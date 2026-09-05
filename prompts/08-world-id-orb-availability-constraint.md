# Architectural Directive: World ID Orb Availability Constraint and Fallback Decision

**Decision Date:** 2026-09-05

## Decision Context (Human Architect)

To demo the relayer's three-state logic (`backed` / `unbacked` / `unknown`) fully, the
`backed` branch needs a test agent address that has actually completed a real World ID Orb
verification — not a mocked or asserted status. Investigation into how to obtain one
surfaced an external constraint, not an engineering one:

1. **The Orb requirement is cryptographic-structural, not a policy setting.** A live
   `cast call` against the deployed AgentBook contract
   (`0xA23aB2712eA7BBa896930544C7d6636a96b944dA`, World Chain) reads `groupId() == 1`.
   Per `world-id-contracts`' own documentation (`docs/user-flows.md`): "the `WorldIDRouter`
   will route the proof to the specified group (0 - Phone, 1 - Orb)" — group 0 and group 1
   are structurally separate Merkle trees, not tiers within one tree. A Device/Phone-level
   World ID proof cannot satisfy `verifyProof(root, groupId=1, ...)`; the identity was never
   inserted into that tree. This is not a restriction AgentKit chose to enforce more
   strictly than necessary — it is what the deployed contract's own configuration requires.
2. **Taiwan currently has no stably operating Orb location.** Biometric-data collection is
   regulated by the FSC (金管會); historical Orb locations here have been repeatedly removed
   under regulatory pressure. This is an external, jurisdiction-level constraint, not
   something resolvable within this project's scope or timeline.
3. **A possible mitigation exists but is unconfirmed.** ETHGlobal's own ETHOnline 2026
   AgentKit Continuity prize page lists "Uses the World ID Sandbox App to test the project
   remotely" as a qualification criterion, with a real Sandbox Access request channel
   (Firebase App Distribution beta, requested via the form ETHGlobal links). Access has been
   requested. As of this decision, it is **not confirmed** whether a proof generated through
   this sandbox can satisfy AgentBook's on-chain `groupId=1` check — official AgentKit docs
   (`docs.world.org/agents/agent-kit/integrate`) make no mention of this sandbox at all, so
   compatibility cannot be verified from documentation alone. This is recorded as a pending
   verification item, not as a known-working path.

## Core Directives Given to Claude Code

Adopt a fallback plan now, rather than letting an unresolved external dependency block the
hackathon submission timeline:

- If Sandbox Access is confirmed working before submission, use it to register a real
  `backed` test address and demo that branch live, same as `unbacked` already is.
- If it cannot be confirmed workable in time, the demo shows the `unbacked` scenario in
  full — already completely verified against real on-chain data (see the decision-engine's
  57/57 live AgentBook reads, all correctly returning `unbacked` for freshly generated,
  genuinely unregistered addresses). For the `backed` branch specifically, the README's
  Honest Disclosure will state plainly that its logic correctness was confirmed via code
  review and unit tests (`relayer/src/agent-book.js`'s three-state read, exercised in
  `relayer/test/replay.test.js` and `decision-engine/test/`), not a live on-chain test — and
  that the reason is a regional regulatory constraint on Orb availability, not an unverified
  or untested code path being passed off as verified.

## Implementation & Trade-off Constraints

This is a disclosure decision, not a code change: nothing in `relayer/` or
`decision-engine/` is modified by this ADR. It commits the project to updating the README's
Honest Disclosure section with the exact framing above once the Sandbox Access outcome is
known (either a live `backed` demo, or the disclosed code-review-only caveat) — not before,
since the outcome is still pending as of this decision.

This follows the project's existing honest-disclosure precedent rather than introducing a
new one: disclosing a real limitation with its exact cause, instead of either hiding it or
overstating what has actually been verified. See the genesis-round decimals-anomaly
disclosure (`docs/spec.md`) and the relayer's own "trusted-signer bridge, not
trust-minimized" disclosure (root `README.md`, Honest Disclosure section) for the same
pattern applied elsewhere in this project.
