import {
  AnswerUpdated as AnswerUpdatedEvent,
  NewRound as NewRoundEvent
} from "../generated/NVDARawAggregator/NVDARawAggregator"
import { saveAnswerUpdated, saveNewRound, updatePriceRangeIndex } from "./raw-aggregator-common"

const SYMBOL = "NVDA"
const DECIMALS: u8 = 8

export function handleAnswerUpdated(event: AnswerUpdatedEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  saveAnswerUpdated(
    id,
    event.address,
    event.params.current,
    event.params.roundId,
    event.params.updatedAt,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  )
  updatePriceRangeIndex(
    id,
    event.address,
    SYMBOL,
    event.params.roundId,
    event.params.current,
    DECIMALS,
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
