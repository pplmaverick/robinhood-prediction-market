import { newMockEvent } from "matchstick-as"
import { ethereum, BigInt, Address } from "@graphprotocol/graph-ts"
import {
  AnswerUpdated,
  NewRound
} from "../generated/TSLARawAggregator/TSLARawAggregator"

export function createAnswerUpdatedEvent(
  current: BigInt,
  roundId: BigInt,
  updatedAt: BigInt
): AnswerUpdated {
  let answerUpdatedEvent = changetype<AnswerUpdated>(newMockEvent())

  answerUpdatedEvent.parameters = new Array()

  answerUpdatedEvent.parameters.push(
    new ethereum.EventParam("current", ethereum.Value.fromSignedBigInt(current))
  )
  answerUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "roundId",
      ethereum.Value.fromUnsignedBigInt(roundId)
    )
  )
  answerUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "updatedAt",
      ethereum.Value.fromUnsignedBigInt(updatedAt)
    )
  )

  return answerUpdatedEvent
}

export function createNewRoundEvent(
  roundId: BigInt,
  startedBy: Address,
  startedAt: BigInt
): NewRound {
  let newRoundEvent = changetype<NewRound>(newMockEvent())

  newRoundEvent.parameters = new Array()

  newRoundEvent.parameters.push(
    new ethereum.EventParam(
      "roundId",
      ethereum.Value.fromUnsignedBigInt(roundId)
    )
  )
  newRoundEvent.parameters.push(
    new ethereum.EventParam("startedBy", ethereum.Value.fromAddress(startedBy))
  )
  newRoundEvent.parameters.push(
    new ethereum.EventParam(
      "startedAt",
      ethereum.Value.fromUnsignedBigInt(startedAt)
    )
  )

  return newRoundEvent
}
