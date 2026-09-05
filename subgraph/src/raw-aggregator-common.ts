import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { AnswerUpdated, NewRound } from "../generated/schema"

export function saveAnswerUpdated(
  id: Bytes,
  feedAddress: Bytes,
  current: BigInt,
  roundId: BigInt,
  updatedAt: BigInt,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  transactionHash: Bytes
): void {
  let entity = new AnswerUpdated(id)
  entity.feedAddress = feedAddress
  entity.current = current
  entity.roundId = roundId
  entity.updatedAt = updatedAt
  entity.blockNumber = blockNumber
  entity.blockTimestamp = blockTimestamp
  entity.transactionHash = transactionHash
  entity.save()
}

export function saveNewRound(
  id: Bytes,
  feedAddress: Bytes,
  roundId: BigInt,
  startedBy: Bytes,
  startedAt: BigInt,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  transactionHash: Bytes
): void {
  let entity = new NewRound(id)
  entity.feedAddress = feedAddress
  entity.roundId = roundId
  entity.startedBy = startedBy
  entity.startedAt = startedAt
  entity.blockNumber = blockNumber
  entity.blockTimestamp = blockTimestamp
  entity.transactionHash = transactionHash
  entity.save()
}
