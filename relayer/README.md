# AgentKit Relayer

Trusted-signer relayer bridging World AgentKit's human-verification (World ID via AgentBook)
into a Robinhood Chain attestation. Built as its own package with pinned dependency versions
(no `^`/`~` — see `package.json` and the committed `package-lock.json`).

**Scope for this round**: verifies an agent's signed request, checks AgentBook, enforces replay
protection, and signs an attestation. It does **not** call `placeBet()` or touch
`StockPredictionMarket.sol` — consuming the attestation on-chain is separate, not-yet-built work.

See the root `README.md`'s Honest Disclosure section for the trust model this implies.

## Pipeline

1. `verify-signature.js` — `@worldcoin/agentkit-core`'s `verifyAgentkitSignature` +
   `validateAgentkitMessage`, unmodified.
2. `agent-book.js` — `lookupHumanBacking()`, a three-state (`backed` / `unbacked` / `unknown`)
   AgentBook read that never collapses an RPC failure into "not registered". Mirrors
   [poh-aggregator's `lookupHumanBacking`](https://github.com/andrevalenm/poh-aggregator/blob/a26488ac8e3a4ed02068d3693856358b81e7e2fd/apps/agent/src/world/agentbook.js#L63-L82).
3. `nonce-store.js` — Robinhood-side strictly-increasing nonce + timestamp expiry. Its own
   namespace, independent of AgentKit's SIWE nonce (AgentKit has no persistent nonce mechanism
   of its own on either its current or in-flight interface — see `config.js`).
4. `attestation.js` — builds a keccak256 digest of the attestation fields and signs it directly
   with raw secp256k1 (`@noble/curves`), not `personal_sign`/EIP-712.

## Running

```bash
npm install        # exact versions from package-lock.json
npm test           # deterministic unit tests (nonce store + full pipeline, network mocked)
node scripts/live-e2e-demo.mjs   # live demo: real signature verification (real RPC), real
                                  # AgentBook read on World Chain mainnet, real replay rejection
```

## Re-verify before reuse

`src/config.js` documents the exact PR #38 state this was built against
(`worldcoin/agentkit`, still OPEN as of 2026-09-05). If that PR has merged since, the SIWE-based
interface this relayer calls (`verifyAgentkitSignature`, `validateAgentkitMessage`) will have
been replaced with an RFC 9421 interface — re-read `RESEARCH_NOTES_x402_agentkit_0903.md` before
assuming anything here still matches `main`.
