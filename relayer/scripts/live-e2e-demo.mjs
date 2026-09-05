// Live, non-mocked demonstration — run manually, not part of `npm test` (network-dependent,
// so it's not suitable as a CI-gating regression test). What's genuinely real here:
//   - a real secp256k1 keypair signs a real SIWE message via viem's account.signMessage()
//   - @worldcoin/agentkit-core's actual verifyAgentkitSignature() verifies it, which
//     (per core/src/evm.ts on `main`) makes a real RPC call to Base for the ERC-6492 check
//   - agent-book.js's lookupHumanBacking() makes a real eth_call to the real AgentBook
//     contract on World Chain mainnet for this freshly-generated (certainly unregistered)
//     address, proving the three-state read path works against the live contract
//   - the relayer's own attestation signature is real raw secp256k1, self-verified by recovery
//
// What's injected rather than real: the AgentBook "backed" status for the *pipeline* run.
// A fresh random test address is, correctly, genuinely unregistered — proving that requires no
// injection (see the real lookup below), but to show the replay gate actually engage we need a
// request that clears the human-backing check, and this repo has no real registered AgentBook
// entry to test against. That one field is substituted; nothing else in the pipeline is.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { formatSIWEMessage } from '@worldcoin/agentkit-core'
import { handleAgentRequest } from '../src/relayer.js'
import { lookupHumanBacking } from '../src/agent-book.js'
import { NonceStore } from '../src/nonce-store.js'
import { recoverSignerAddress, deriveAddressFromPrivateKey } from '../src/attestation.js'

const RESOURCE_URI = 'https://robinhood-stock-market.example/relayer/attest'
const RELAYER_PRIVATE_KEY = `0x${'7b'.repeat(32)}`

async function main() {
  const agentPrivateKey = generatePrivateKey()
  const account = privateKeyToAccount(agentPrivateKey)
  console.log(`[1/5] Generated a fresh test agent EOA: ${account.address}`)

  const domain = new URL(RESOURCE_URI).hostname
  const now = new Date()
  const payloadInfo = {
    domain,
    uri: RESOURCE_URI,
    statement: 'Robinhood Stock Market relayer — live interop demo',
    version: '1',
    chainId: 'eip155:8453', // Base — one of AgentKit's own defaultPublicRpcUrls entries
    type: 'eip191',
    nonce: Math.random().toString(36).slice(2),
    issuedAt: now.toISOString(),
  }

  const message = formatSIWEMessage(payloadInfo, account.address)
  const signature = await account.signMessage({ message })
  console.log('[2/5] Signed a real SIWE message with a real EOA (viem account.signMessage)')

  const agentkitPayload = { ...payloadInfo, address: account.address, signature }

  console.log('[3/5] Querying the REAL AgentBook contract on World Chain mainnet for this fresh address...')
  const liveBacking = await lookupHumanBacking(account.address)
  console.log(`      -> ${JSON.stringify(liveBacking)} (expected: unbacked — this address was never registered)`)

  const nonceStore = new NonceStore()
  const relayerAddress = deriveAddressFromPrivateKey(RELAYER_PRIVATE_KEY)

  function buildArgs(robinhoodNonce) {
    const issuedAt = BigInt(Date.now())
    return {
      agentkitPayload,
      expectedResourceUri: RESOURCE_URI,
      request: {
        marketId: 3n,
        direction: 0,
        amount: 1_000_000_000_000_000n,
        robinhoodNonce,
        issuedAt,
        expiresAt: issuedAt + 300_000n,
      },
      nonceStore,
      relayerPrivateKeyHex: RELAYER_PRIVATE_KEY,
    }
  }

  // Real verifyAgentRequest (real RPC-backed signature check). AgentBook status injected as
  // 'backed' for this run only — see file header for why.
  const deps = { lookupHumanBacking: async () => ({ status: 'backed', humanId: '999', source: 'demo-injected' }) }

  console.log('[4/5] Submitting the signed request through the REAL verifyAgentkitSignature + validateAgentkitMessage pipeline...')
  const first = await handleAgentRequest(buildArgs(1n), deps)
  console.log(`      first submission -> ok=${first.ok}${first.ok ? '' : ` reason=${first.reason} error=${first.error}`}`)

  if (first.ok) {
    const recovered = recoverSignerAddress(first.hash, first.signature.r, first.signature.s, first.signature.v)
    console.log(`      attestation signer recovers to ${recovered} — relayer address is ${relayerAddress} — match=${recovered.toLowerCase() === relayerAddress.toLowerCase()}`)
  }

  console.log('[5/5] Replaying the exact same signed request (same robinhoodNonce)...')
  const second = await handleAgentRequest(buildArgs(1n), deps)
  console.log(`      second submission -> ok=${second.ok}${second.ok ? '' : ` reason=${second.reason}`}`)

  if (first.ok && !second.ok && second.reason === 'replay_replay') {
    console.log('\nRESULT: PASS — real signature verified via live RPC, real AgentBook read confirmed live, replay correctly rejected.')
  } else {
    console.log('\nRESULT: FAIL — see output above.')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
