import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { AnswerUpdated, NewRound, FeedWindow, PriceRangeIndex } from "../generated/schema"

const WINDOW_SIZE = 20

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

// NOTE: this handler does not apply the genesis-round decimals-anomaly
// filter documented in docs/spec.md ("Handling approach"). It is safe today
// because the indexed block window (see subgraph.yaml startBlock) begins
// long after the anomalous rounds ended, but if the indexing window is ever
// extended back to genesis, an isAnomalous check must be added before a
// price is pushed into the window, or corrupted-scale prices will pollute
// mean/volatility/percentile for every subsequent event.
export function updatePriceRangeIndex(
  id: Bytes,
  feedAddress: Bytes,
  symbol: string,
  roundId: BigInt,
  rawPrice: BigInt,
  decimals: u8,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  transactionHash: Bytes
): void {
  let divisor = BigInt.fromI32(10).pow(decimals).toBigDecimal()
  let currentPrice = rawPrice.toBigDecimal().div(divisor)

  let window = FeedWindow.load(feedAddress)
  if (window == null) {
    window = new FeedWindow(feedAddress)
    window.feedAddress = feedAddress
    window.prices = []
  }

  let prices = window.prices
  prices.push(currentPrice)
  if (prices.length > WINDOW_SIZE) {
    prices.shift()
  }
  window.prices = prices
  window.updatedAtBlock = blockNumber
  window.save()

  let n = prices.length
  let actualWindowSize = n
  let isFullWindow = n == WINDOW_SIZE

  // Moving average: exact BigDecimal arithmetic throughout, no float
  // round-trip needed for +, -, *, / on graph-ts BigDecimal.
  let sum = BigDecimal.zero()
  for (let i = 0; i < n; i++) {
    sum = sum.plus(prices[i])
  }
  let movingAverage = sum.div(BigInt.fromI32(n).toBigDecimal())

  // Volatility: sample standard deviation, ddof=1 (docs/spec.md rationale).
  // graph-ts's BigDecimal has no sqrt() method -- variance is computed in
  // exact BigDecimal arithmetic, then round-tripped through f64 (via
  // toString()/parseFloat/Math.sqrt) solely for the square root, then
  // converted back to BigDecimal for storage. This bounds precision to
  // IEEE-754 double (~15-17 significant digits) for this one field only;
  // everything else in this function stays in exact decimal arithmetic.
  // n < 2 has no defined sample variance (division by n-1=0); this handler
  // defines volatility as 0 in that case as an explicit convention, not a
  // mathematical derivation -- flagged in docs/spec.md.
  let volatility: BigDecimal
  if (n < 2) {
    volatility = BigDecimal.zero()
  } else {
    let sumSquaredDiff = BigDecimal.zero()
    for (let i = 0; i < n; i++) {
      let diff = prices[i].minus(movingAverage)
      sumSquaredDiff = sumSquaredDiff.plus(diff.times(diff))
    }
    let variance = sumSquaredDiff.div(BigInt.fromI32(n - 1).toBigDecimal())
    let varianceF64 = parseFloat(variance.toString())
    let stddevF64 = Math.sqrt(varianceF64)
    volatility = BigDecimal.fromString(stddevF64.toString())
  }

  // Percentile rank: % of window values <= currentPrice, computed after
  // currentPrice has been pushed into the window (docs/spec.md definition).
  let countLE = 0
  for (let i = 0; i < n; i++) {
    if (prices[i].le(currentPrice)) {
      countLE++
    }
  }
  let percentileRank = BigInt.fromI32(countLE)
    .toBigDecimal()
    .div(BigInt.fromI32(n).toBigDecimal())
    .times(BigDecimal.fromString("100"))

  let entity = new PriceRangeIndex(id)
  entity.feedAddress = feedAddress
  entity.symbol = symbol
  entity.roundId = roundId
  entity.currentPrice = currentPrice
  entity.movingAverage = movingAverage
  entity.volatility = volatility
  entity.percentileRank = percentileRank
  entity.actualWindowSize = actualWindowSize
  entity.isFullWindow = isFullWindow
  entity.blockNumber = blockNumber
  entity.blockTimestamp = blockTimestamp
  entity.transactionHash = transactionHash
  entity.save()
}
