"""
Independent reference model for StockPredictionMarket.settleMarket() and
claimWinnings(). Scope is intentionally limited to these two functions —
createMarket() and lockMarket() are out of scope for this verification pass.

This model is derived from the contract's EXTERNAL, documented behavior
rather than transliterated from the Solidity body:

  - NatSpec (contracts/StockPredictionMarket.sol):
      settleMarket:   "Settle the market by reading the final price from oracle"
      claimWinnings:  "Claim winnings after market is settled"
  - Public ABI surface that is part of the contract's observable interface,
    not hidden implementation detail: the `FEE_BPS` constant (200 = 2%),
    the `Direction` enum (BULL=0, BEAR=1), and the `MarketSettled` /
    `WinningsClaimed` event shapes (which fix what "winner" and "payout"
    must mean for external observers).
  - README.md's documented behavior: "the winning side splits the total
    pool proportional to their stake, minus a 2% protocol fee" and the
    disclosed tie-handling ("TIE defaults to BULL win").
  - The `ChainlinkPriceFeed` adapter's documented guarantees (its own
    NatSpec: "staleness and sanity checks that the raw aggregator does
    not enforce") are modeled as preconditions on the round data a market's
    priceFeed can legally return, since any market that settled at all is
    on-chain proof those preconditions held (see comparison_report.md).

Where the externally observable behavior requires an exact formula (payout
math), integer (floor) division is used deliberately to match Solidity's
uint256 semantics — this is a fidelity requirement, not implementation
copying: the model has to reproduce the exact wei amounts the contract paid
out, and floating point cannot do that.
"""
from dataclasses import dataclass
from enum import IntEnum


class Direction(IntEnum):
    BULL = 0
    BEAR = 1


FEE_BPS = 200          # 2%, from the contract's public FEE_BPS constant
BPS_DENOMINATOR = 10000


@dataclass
class RoundPrecondition:
    """What ChainlinkPriceFeed.latestRoundData() guarantees to its caller
    before a price is ever returned to StockPredictionMarket. A market that
    successfully settled is on-chain proof these held at call time."""
    answer_positive: bool
    updated_at_nonzero: bool
    within_staleness: bool  # block.timestamp - updatedAt <= maxStaleness


def determine_winner(open_price: int, close_price: int) -> Direction:
    """settleMarket(): Direction winner = price >= openPrice ? BULL : BEAR.
    Ties go to BULL — this is externally observable (and README-disclosed)
    behavior, not an incidental implementation detail, so the model encodes
    it explicitly rather than treating '>=' as an arbitrary choice."""
    return Direction.BULL if close_price >= open_price else Direction.BEAR


def compute_payout(total_bull_pool: int, total_bear_pool: int,
                    winner: Direction, bet_amount: int) -> int:
    """claimWinnings(): winning side splits (totalPool - 2% fee)
    proportional to stake. Integer division throughout, matching
    Solidity's uint256 arithmetic exactly.

    Raises ZeroDivisionError if the winning side's pool is 0 — this is
    intentional: the reference model does NOT invent a refund path that
    the contract itself does not implement. See comparison_report.md for
    why this matters (README claims a refund exists; the deployed code
    has no such path)."""
    total_pool = total_bull_pool + total_bear_pool
    fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
    winner_pool = total_bull_pool if winner == Direction.BULL else total_bear_pool
    return ((total_pool - fee) * bet_amount) // winner_pool


def check_round_preconditions(answer: int, updated_at: int, block_timestamp: int,
                               max_staleness: int) -> RoundPrecondition:
    return RoundPrecondition(
        answer_positive=answer > 0,
        updated_at_nonzero=updated_at > 0,
        within_staleness=(block_timestamp - updated_at) <= max_staleness,
    )


def settle_market(open_price: int, close_price: int) -> dict:
    """Full settleMarket() outcome model: closePrice is taken as given
    (it is the oracle's `answer` field, forwarded verbatim by both
    StockPredictionMarket and ChainlinkPriceFeed with no unit conversion —
    see comparison_report.md Finding 1 on the absence of decimals
    normalization anywhere in the call path)."""
    winner = determine_winner(open_price, close_price)
    return {"closePrice": close_price, "winner": int(winner)}


def claim_winnings(total_bull_pool: int, total_bear_pool: int,
                    open_price: int, close_price: int,
                    bettor_direction: Direction, bet_amount: int) -> dict:
    winner = determine_winner(open_price, close_price)
    if bettor_direction != winner:
        raise ValueError("Lost")  # require(b.direction == winner, "Lost")
    payout = compute_payout(total_bull_pool, total_bear_pool, winner, bet_amount)
    return {"winner": int(winner), "payout": payout}
