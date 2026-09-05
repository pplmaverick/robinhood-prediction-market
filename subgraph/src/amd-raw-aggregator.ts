import {
  AnswerUpdated as AnswerUpdatedEvent,
  NewRound as NewRoundEvent
} from "../generated/AMDRawAggregator/AMDRawAggregator"
import { saveAnswerUpdated, saveNewRound } from "./raw-aggregator-common"

export function handleAnswerUpdated(event: AnswerUpdatedEvent): void {
  saveAnswerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
    event.address,
    event.params.current,
    event.params.roundId,
    event.params.updatedAt,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  )
}

export function handleNewRound(event: NewRoundEvent): void {
  saveNewRound(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
    event.address,
    event.params.roundId,
    event.params.startedBy,
    event.params.startedAt,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  )
}
