// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt,
        uint256 updatedAt, uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract MockPriceFeed is IPriceFeed {
    int256 private _price;
    uint8 private _decimals;
    constructor(int256 initialPrice, uint8 dec) {
        _price = initialPrice;
        _decimals = dec;
    }
    function setPrice(int256 newPrice) external { _price = newPrice; }
    function decimals() external view override returns (uint8) { return _decimals; }
    function latestRoundData() external view override returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (1, _price, block.timestamp, block.timestamp, 1);
    }
}
