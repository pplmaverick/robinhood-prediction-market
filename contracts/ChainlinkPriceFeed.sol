// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./MockPriceFeed.sol";

/**
 * @title ChainlinkPriceFeed
 * @notice Adapter that exposes a Chainlink AggregatorV3Interface feed through the
 *         IPriceFeed interface expected by StockPredictionMarket, with staleness
 *         and sanity checks that the raw aggregator does not enforce.
 */
contract ChainlinkPriceFeed is IPriceFeed {
    AggregatorV3Interface public immutable aggregator;
    uint256 public immutable maxStaleness;

    constructor(address aggregatorAddress, uint256 maxStalenessSeconds) {
        aggregator = AggregatorV3Interface(aggregatorAddress);
        maxStaleness = maxStalenessSeconds;
    }

    function decimals() external view override returns (uint8) {
        return aggregator.decimals();
    }

    function latestRoundData() external view override returns (
        uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
    ) {
        (roundId, answer, startedAt, updatedAt, answeredInRound) = aggregator.latestRoundData();
        require(answer > 0, "ChainlinkPriceFeed: non-positive price");
        require(updatedAt > 0, "ChainlinkPriceFeed: round not complete");
        require(block.timestamp - updatedAt <= maxStaleness, "ChainlinkPriceFeed: stale price");
    }
}
