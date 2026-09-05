'use strict'

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { encodePacked, keccak256, hexToBytes, bytesToHex, getAddress } from 'viem'

// Step 4 requirement: raw-hash signing, not personal_sign (EIP-191) or EIP-712. We build our
// own digest and sign that digest directly with secp256k1 — no message prefix, no domain
// separator, no ABI-encoded typed-data wrapper. This is why we reach for @noble/curves'
// primitive `sign()`/`recoverPublicKey()` instead of viem/ethers `signMessage`/`signTypedData`,
// which both add a prefix or domain separator before hashing.
//
// Correctness trap found while wiring this up: @noble/curves v2's `secp256k1.sign()` defaults
// to `prehash: true`, meaning it SHA-256-hashes its input again before signing. Since our input
// is already a finished keccak256 digest, that default would silently sign
// sha256(keccak256(payload)) instead of keccak256(payload) — a signature Solidity's
// `ecrecover(hash, v, r, s)` could never validate against the real digest, with no error at
// sign time (only a downstream "recovered address doesn't match" failure). `prehash: false`
// must be passed explicitly at every sign/verify/recover call site below.

/**
 * @param {{ agentAddress: `0x${string}`, humanId: bigint, marketId: bigint, direction: number, amount: bigint, robinhoodNonce: bigint, issuedAt: bigint, expiresAt: bigint }} fields
 * @returns {`0x${string}`}
 */
function buildAttestationHash(fields) {
  // getAddress() enforces/normalizes EIP-55 checksum casing. Not cosmetic: encodePacked's
  // 'address' type rejects a value whose casing doesn't match its checksum, precisely to catch
  // an address string that's been corrupted or mistyped in a way plain lowercase comparison
  // wouldn't reveal — surfaced during testing when a fixture address failed this exact check.
  return keccak256(
    encodePacked(
      ['address', 'uint256', 'uint256', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        getAddress(fields.agentAddress),
        fields.humanId,
        fields.marketId,
        fields.direction,
        fields.amount,
        fields.robinhoodNonce,
        fields.issuedAt,
        fields.expiresAt,
      ]
    )
  )
}

/**
 * @param {`0x${string}`} digestHex 32-byte hash to sign directly (no prefix)
 * @param {`0x${string}`} relayerPrivateKeyHex
 * @returns {{ r: `0x${string}`, s: `0x${string}`, v: number, signature: `0x${string}` }}
 */
function signRawHash(digestHex, relayerPrivateKeyHex) {
  const digest = hexToBytes(digestHex)
  const privateKey = hexToBytes(relayerPrivateKeyHex)

  const recoveredBytes = secp256k1.sign(digest, privateKey, { format: 'recovered', prehash: false })
  const sig = secp256k1.Signature.fromBytes(recoveredBytes, 'recovered')

  const r = bytesToHex(numberToBytes32(sig.r))
  const s = bytesToHex(numberToBytes32(sig.s))
  const v = sig.recovery + 27 // Solidity ecrecover expects v in {27, 28}
  const signature = bytesToHex(recoveredBytes) // r(32) || s(32) || recovery(1), recovery here is 0/1 not v

  return { r, s, v, signature }
}

/**
 * @param {`0x${string}`} digestHex
 * @param {`0x${string}`} r
 * @param {`0x${string}`} s
 * @param {number} v 27 or 28
 * @returns {`0x${string}`} the recovered agent-style Ethereum address, checksummed-free lowercase
 */
function recoverSignerAddress(digestHex, r, s, v) {
  const digest = hexToBytes(digestHex)
  const recovery = v - 27
  const sig = new secp256k1.Signature(BigInt(r), BigInt(s), recovery)
  const pubKey = sig.recoverPublicKey(digest, { prehash: false })
  return publicKeyToAddress(pubKey.toBytes(false))
}

/**
 * @param {Uint8Array} uncompressedPubKey 65 bytes, 0x04 prefix + 32-byte X + 32-byte Y
 * @returns {`0x${string}`}
 */
function publicKeyToAddress(uncompressedPubKey) {
  const withoutPrefix = uncompressedPubKey.slice(1)
  const hash = keccak256(bytesToHex(withoutPrefix))
  return `0x${hash.slice(-40)}`
}

function deriveAddressFromPrivateKey(privateKeyHex) {
  const pub = secp256k1.getPublicKey(hexToBytes(privateKeyHex), false)
  return publicKeyToAddress(pub)
}

function numberToBytes32(n) {
  const hex = n.toString(16).padStart(64, '0')
  return hexToBytes(`0x${hex}`)
}

export { buildAttestationHash, signRawHash, recoverSignerAddress, deriveAddressFromPrivateKey, publicKeyToAddress }
