// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStockPredictionMarket {
    enum Direction { BULL, BEAR }
    enum MarketState { OPEN, LOCKED, SETTLED }

    function markets(uint256 marketId) external view returns (
        address stockToken,
        address priceFeed,
        string memory symbol,
        uint256 roundId,
        uint256 openTime,
        uint256 closeTime,
        int256 openPrice,
        int256 closePrice,
        uint256 bullPool,
        uint256 bearPool,
        uint8 state
    );
}

contract AgentStockMarket {
    address public immutable relayerAddress;
    IStockPredictionMarket public immutable sourceMarket;
    uint256 public immutable maxBetSizeWei;

    struct Attestation {
        address agentAddress;
        uint256 humanId;
        uint256 marketId;
        uint8 direction;      // 0 = BULL, 1 = BEAR — matches source contract exactly
        uint256 amount;
        uint256 robinhoodNonce;
        uint256 issuedAt;
        uint256 expiresAt;
    }

    struct AgentBet {
        uint256 amount;
        uint8 direction;
        bool claimed;
    }

    mapping(uint256 => mapping(address => AgentBet)) public agentBets;
    mapping(uint256 => uint256) public agentBullPool;
    mapping(uint256 => uint256) public agentBearPool;
    mapping(bytes32 => bool) public usedAttestations;

    event AgentBetPlaced(uint256 indexed marketId, address indexed agentAddress, uint8 direction, uint256 amount);
    event AgentWinningsClaimed(uint256 indexed marketId, address indexed agentAddress, uint256 payout);

    constructor(address _relayerAddress, address _sourceMarket, uint256 _maxBetSizeWei) {
        relayerAddress = _relayerAddress;
        sourceMarket = IStockPredictionMarket(_sourceMarket);
        maxBetSizeWei = _maxBetSizeWei; // deploy-time value must match decision-engine's
                                         // current MAX_BET_SIZE_WEI env value — no auto-sync.
    }

    function placeAgentBet(Attestation calldata a, uint8 v, bytes32 r, bytes32 s) external payable {
        require(block.timestamp <= a.expiresAt, "attestation expired");
        require(a.amount <= maxBetSizeWei, "exceeds max bet size");
        require(msg.value == a.amount, "value mismatch");

        bytes32 hash = keccak256(abi.encodePacked(
            a.agentAddress, a.humanId, a.marketId, a.direction,
            a.amount, a.robinhoodNonce, a.issuedAt, a.expiresAt
        ));
        require(!usedAttestations[hash], "attestation already used");

        address signer = ecrecover(hash, v, r, s);
        require(signer == relayerAddress, "invalid attestation signature");

        (, , , , , uint256 closeTime, , , , , uint8 state) = sourceMarket.markets(a.marketId);
        require(state == uint8(IStockPredictionMarket.MarketState.OPEN), "source market not open");
        require(block.timestamp < closeTime, "source market closed");

        usedAttestations[hash] = true;
        agentBets[a.marketId][a.agentAddress] = AgentBet(a.amount, a.direction, false);

        if (a.direction == 0) agentBullPool[a.marketId] += a.amount;
        else agentBearPool[a.marketId] += a.amount;

        emit AgentBetPlaced(a.marketId, a.agentAddress, a.direction, a.amount);
    }

    function claimAgentWinnings(uint256 marketId) external {
        AgentBet storage bet = agentBets[marketId][msg.sender];
        require(bet.amount > 0, "no bet found");
        require(!bet.claimed, "already claimed");

        (, , , , , , int256 openPrice, int256 closePrice, , , uint8 state) = sourceMarket.markets(marketId);
        require(state == uint8(IStockPredictionMarket.MarketState.SETTLED), "source market not settled");

        // Mirrors source contract's tie-break rule exactly: closePrice >= openPrice → BULL wins.
        // No tie-refund mechanism, by design parity with source (documented limitation).
        uint8 winningDirection = closePrice >= openPrice
            ? uint8(IStockPredictionMarket.Direction.BULL)
            : uint8(IStockPredictionMarket.Direction.BEAR);
        require(bet.direction == winningDirection, "bet did not win");

        uint256 totalPool = agentBullPool[marketId] + agentBearPool[marketId];
        uint256 winningPool = winningDirection == 0 ? agentBullPool[marketId] : agentBearPool[marketId];
        uint256 payout = (bet.amount * totalPool) / winningPool;

        bet.claimed = true;
        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "payout transfer failed");

        emit AgentWinningsClaimed(marketId, msg.sender, payout);
    }
}
