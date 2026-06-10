// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockPriceFeed.sol";

/**
 * @title StockPredictionMarket
 * @notice Parimutuel prediction market for RWA stock tokens on Robinhood Chain.
 *         Uses chain-native stock token addresses (TSLA, AMZN, PLTR, NFLX, AMD)
 *         as market identifiers. Oracle architecture supports Chainlink price feeds.
 * @dev Deployed on Robinhood Chain Testnet (Chain ID: 46630)
 */
contract StockPredictionMarket {
    // ── Types ──────────────────────────────────────────────────────────────
    enum Direction { BULL, BEAR }
    enum MarketState { OPEN, LOCKED, SETTLED }

    struct Market {
        address stockToken;   // Robinhood Chain native stock token address
        address priceFeed;    // Chainlink-compatible price feed (IPriceFeed)
        string  symbol;       // e.g. "TSLA"
        uint256 roundId;
        uint256 openTime;
        uint256 closeTime;
        int256  openPrice;
        int256  closePrice;
        uint256 bullPool;
        uint256 bearPool;
        MarketState state;
    }

    struct Bet {
        Direction direction;
        uint256 amount;
        bool claimed;
    }

    // ── State ───────────────────────────────────────────────────────────────
    address public owner;
    uint256 public marketCount;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant FEE_BPS = 200; // 2%

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Bet)) public bets;

    // ── Events ──────────────────────────────────────────────────────────────
    event MarketCreated(uint256 indexed marketId, string symbol, address stockToken);
    event BetPlaced(uint256 indexed marketId, address indexed user, Direction direction, uint256 amount);
    event MarketLocked(uint256 indexed marketId, int256 openPrice);
    event MarketSettled(uint256 indexed marketId, int256 closePrice, Direction winner);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount);

    // ── Constructor ─────────────────────────────────────────────────────────
    constructor() { owner = msg.sender; }
    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    // ── Core Functions ──────────────────────────────────────────────────────

    /**
     * @notice Create a new prediction round for a stock token
     * @param stockToken Robinhood Chain native stock token address
     * @param priceFeed  Chainlink-compatible oracle address
     * @param symbol     Ticker symbol for display
     * @param duration   Seconds until betting closes
     */
    function createMarket(
        address stockToken,
        address priceFeed,
        string calldata symbol,
        uint256 duration
    ) external onlyOwner returns (uint256 marketId) {
        marketId = marketCount++;
        markets[marketId] = Market({
            stockToken: stockToken,
            priceFeed:  priceFeed,
            symbol:     symbol,
            roundId:    marketId,
            openTime:   block.timestamp,
            closeTime:  block.timestamp + duration,
            openPrice:  0,
            closePrice: 0,
            bullPool:   0,
            bearPool:   0,
            state:      MarketState.OPEN
        });
        emit MarketCreated(marketId, symbol, stockToken);
    }

    /// @notice Place a bet on BULL (price up) or BEAR (price down)
    function placeBet(uint256 marketId, Direction direction) external payable {
        Market storage m = markets[marketId];
        require(m.state == MarketState.OPEN, "Market not open");
        require(block.timestamp < m.closeTime, "Betting closed");
        require(msg.value >= MIN_BET, "Below min bet");
        require(bets[marketId][msg.sender].amount == 0, "Already bet");

        bets[marketId][msg.sender] = Bet({ direction: direction, amount: msg.value, claimed: false });

        if (direction == Direction.BULL) m.bullPool += msg.value;
        else m.bearPool += msg.value;

        emit BetPlaced(marketId, msg.sender, direction, msg.value);
    }

    /// @notice Lock the market and snapshot the opening price from oracle
    function lockMarket(uint256 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.state == MarketState.OPEN, "Not open");
        require(block.timestamp >= m.closeTime, "Too early");
        (, int256 price,,,) = IPriceFeed(m.priceFeed).latestRoundData();
        m.openPrice = price;
        m.state = MarketState.LOCKED;
        emit MarketLocked(marketId, price);
    }

    /// @notice Settle the market by reading the final price from oracle
    function settleMarket(uint256 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.state == MarketState.LOCKED, "Not locked");
        (, int256 price,,,) = IPriceFeed(m.priceFeed).latestRoundData();
        m.closePrice = price;
        m.state = MarketState.SETTLED;
        Direction winner = price >= m.openPrice ? Direction.BULL : Direction.BEAR;
        emit MarketSettled(marketId, price, winner);
    }

    /// @notice Claim winnings after market is settled
    function claimWinnings(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.state == MarketState.SETTLED, "Not settled");
        Bet storage b = bets[marketId][msg.sender];
        require(b.amount > 0 && !b.claimed, "Nothing to claim");

        Direction winner = m.closePrice >= m.openPrice ? Direction.BULL : Direction.BEAR;
        require(b.direction == winner, "Lost");

        uint256 totalPool = m.bullPool + m.bearPool;
        uint256 fee = (totalPool * FEE_BPS) / 10000;
        uint256 winnerPool = winner == Direction.BULL ? m.bullPool : m.bearPool;
        uint256 payout = ((totalPool - fee) * b.amount) / winnerPool;

        b.claimed = true;
        payable(msg.sender).transfer(payout);
        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    receive() external payable {}
}
