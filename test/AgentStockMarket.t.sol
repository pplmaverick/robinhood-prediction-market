// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentStockMarket, IStockPredictionMarket} from "../contracts/AgentStockMarket.sol";

/// @dev Test-only double of the real StockPredictionMarket, exposing the same
/// markets() view shape so AgentStockMarket's settlement checks can be driven
/// to arbitrary OPEN/SETTLED states and price pairs on demand.
contract MockStockPredictionMarket is IStockPredictionMarket {
    struct MarketData {
        address stockToken;
        address priceFeed;
        string symbol;
        uint256 roundId;
        uint256 openTime;
        uint256 closeTime;
        int256 openPrice;
        int256 closePrice;
        uint256 bullPool;
        uint256 bearPool;
        uint8 state;
    }

    mapping(uint256 => MarketData) internal _markets;

    function setMarket(uint256 marketId, uint256 closeTime, int256 openPrice, int256 closePrice, uint8 state)
        external
    {
        MarketData storage m = _markets[marketId];
        m.closeTime = closeTime;
        m.openPrice = openPrice;
        m.closePrice = closePrice;
        m.state = state;
    }

    function markets(uint256 marketId)
        external
        view
        override
        returns (
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
        )
    {
        MarketData memory m = _markets[marketId];
        return (
            m.stockToken, m.priceFeed, m.symbol, m.roundId, m.openTime, m.closeTime,
            m.openPrice, m.closePrice, m.bullPool, m.bearPool, m.state
        );
    }
}

/// @notice Independent Reference Model Testing — Solidity/Foundry side.
/// Each test independently recomputes the attestation hash (from the raw
/// fields) and signs it via vm.sign() rather than trusting any precomputed
/// value from verification/test_vectors.json — the only thing shared with
/// the Python side is the raw scenario parameters and the two ephemeral
/// test private keys, matching verification/generate_test_vectors.py exactly.
contract AgentStockMarketTest is Test {
    // TEST-ONLY ephemeral relayer key, generated fresh via `cast wallet new`
    // for this verification task only (2026-09-05). NOT the production
    // relayer identity — never reused outside this test suite. Must stay
    // byte-for-byte identical to verification/generate_test_vectors.py.
    uint256 constant RELAYER_PK = 0x025810031d9dbdd6eea63e8ecd4d9a8b58f26fdcc17317ea7cdfcc52bbe4cc27;
    address constant RELAYER_ADDR = 0x38443D7031F0AE5631C17A584Ca96441EbF07051;
    uint256 constant WRONG_SIGNER_PK = 0x55fddaf6a6998db89fe6855ea24660cfcb7448b4bd4c1d4642ccf1a67571102c;

    uint256 constant MAX_BET_SIZE_WEI = 1_000_000_000_000_000; // decision-engine/src/config.js MAX_BET_SIZE_WEI
    uint256 constant MARKET_ID = 1;
    address constant REAL_SOURCE_MARKET = 0x72DAb8B1B53b3CF028e9A0d1E21178981f264245;
    string constant ROBINHOOD_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";
    string constant RESULTS_PATH = "verification/solidity_actual_results.jsonl";

    AgentStockMarket market;
    MockStockPredictionMarket mock;

    function setUp() public {
        mock = new MockStockPredictionMarket();
        market = new AgentStockMarket(RELAYER_ADDR, address(mock), MAX_BET_SIZE_WEI);
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    function _hashAttestation(AgentStockMarket.Attestation memory a) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                a.agentAddress, a.humanId, a.marketId, a.direction, a.amount, a.robinhoodNonce, a.issuedAt, a.expiresAt
            )
        );
    }

    function _sign(uint256 pk, bytes32 h) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        (v, r, s) = vm.sign(pk, h);
    }

    function _mk(address agent, uint256 humanId, uint8 direction, uint256 amount, uint256 nonce, uint256 issuedAt, uint256 expiresAt)
        internal
        pure
        returns (AgentStockMarket.Attestation memory)
    {
        return AgentStockMarket.Attestation({
            agentAddress: agent,
            humanId: humanId,
            marketId: MARKET_ID,
            direction: direction,
            amount: amount,
            robinhoodNonce: nonce,
            issuedAt: issuedAt,
            expiresAt: expiresAt
        });
    }

    function _lower(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) b[i] = bytes1(uint8(b[i]) + 32);
        }
        return string(b);
    }

    function _hex(bytes32 h) internal pure returns (string memory) {
        return _lower(vm.toString(h));
    }

    function _addr(address a) internal pure returns (string memory) {
        return _lower(vm.toString(a));
    }

    function _amountOrNull(uint256 amount, bool present) internal pure returns (string memory) {
        if (!present) return "null";
        return string.concat('"', vm.toString(amount), '"');
    }

    function _writeCase(string memory caseId, string memory hashField, string memory signerValidField, string memory payoutField)
        internal
    {
        string memory line = string.concat(
            '{"case_id":"', caseId, '","expected_hash":', hashField,
            ',"expected_signer_valid":', signerValidField,
            ',"expected_payout":', payoutField, "}"
        );
        vm.writeLine(RESULTS_PATH, line);
    }

    // ---------------------------------------------------------------------
    // Fork test — read-only interface compatibility against the real,
    // already-deployed StockPredictionMarket on Robinhood Chain mainnet.
    // No state-changing call is made.
    // ---------------------------------------------------------------------

    function test_fork_marketsViewMatchesRealContract() public {
        uint256 forkId = vm.createFork(ROBINHOOD_MAINNET_RPC);
        vm.selectFork(forkId);

        IStockPredictionMarket real = IStockPredictionMarket(REAL_SOURCE_MARKET);
        (
            , , string memory symbol, , uint256 openTime, uint256 closeTime, , , , , uint8 state
        ) = real.markets(0);

        assertLe(state, uint8(IStockPredictionMarket.MarketState.SETTLED));
        assertGt(bytes(symbol).length, 0);
        assertGe(closeTime, openTime);
    }

    // ---------------------------------------------------------------------
    // 01: normal BULL win (mixed pool, sole BULL bettor takes the full pool)
    // ---------------------------------------------------------------------

    function test_01_bullWinsNormal() public {
        address agent1 = address(0x1001);
        address agent2 = address(0x1002);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 1, 0, 600_000_000_000_000, 1, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a2 = _mk(agent2, 2, 1, 400_000_000_000_000, 2, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        bytes32 h2 = _hashAttestation(a2);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, h2);
        market.placeAgentBet{value: a2.amount}(a2, v2, r2, s2);

        mock.setMarket(MARKET_ID, 1_010_000, 100, 110, uint8(IStockPredictionMarket.MarketState.SETTLED));

        vm.prank(agent1);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent1.balance, 1_000_000_000_000_000);

        vm.prank(agent2);
        vm.expectRevert(bytes("bet did not win"));
        market.claimAgentWinnings(MARKET_ID);

        _writeCase(
            "01_bull_wins_normal",
            string.concat('["', _hex(h1), '","', _hex(h2), '"]'),
            "true",
            string.concat('{"', _addr(agent1), '":"1000000000000000","', _addr(agent2), '":null}')
        );
    }

    // ---------------------------------------------------------------------
    // 02: normal BEAR win (mirror of 01)
    // ---------------------------------------------------------------------

    function test_02_bearWinsNormal() public {
        address agent1 = address(0x1003);
        address agent2 = address(0x1004);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 3, 0, 400_000_000_000_000, 1, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a2 = _mk(agent2, 4, 1, 600_000_000_000_000, 2, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        bytes32 h2 = _hashAttestation(a2);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, h2);
        market.placeAgentBet{value: a2.amount}(a2, v2, r2, s2);

        mock.setMarket(MARKET_ID, 1_010_000, 200, 150, uint8(IStockPredictionMarket.MarketState.SETTLED));

        vm.prank(agent1);
        vm.expectRevert(bytes("bet did not win"));
        market.claimAgentWinnings(MARKET_ID);

        vm.prank(agent2);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent2.balance, 1_000_000_000_000_000);

        _writeCase(
            "02_bear_wins_normal",
            string.concat('["', _hex(h1), '","', _hex(h2), '"]'),
            "true",
            string.concat('{"', _addr(agent1), '":null,"', _addr(agent2), '":"1000000000000000"}')
        );
    }

    // ---------------------------------------------------------------------
    // 03: tie (closePrice == openPrice) -> BULL wins, no refund path
    // ---------------------------------------------------------------------

    function test_03_tieBullWins() public {
        address agent1 = address(0x1005);
        address agent2 = address(0x1006);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 5, 0, 500_000_000_000_000, 1, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a2 = _mk(agent2, 6, 1, 500_000_000_000_000, 2, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        bytes32 h2 = _hashAttestation(a2);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, h2);
        market.placeAgentBet{value: a2.amount}(a2, v2, r2, s2);

        mock.setMarket(MARKET_ID, 1_010_000, 300, 300, uint8(IStockPredictionMarket.MarketState.SETTLED));

        vm.prank(agent1);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent1.balance, 1_000_000_000_000_000);

        vm.prank(agent2);
        vm.expectRevert(bytes("bet did not win"));
        market.claimAgentWinnings(MARKET_ID);

        _writeCase(
            "03_tie_bull_wins",
            string.concat('["', _hex(h1), '","', _hex(h2), '"]'),
            "true",
            string.concat('{"', _addr(agent1), '":"1000000000000000","', _addr(agent2), '":null}')
        );
    }

    // ---------------------------------------------------------------------
    // 04: expired attestation -> placeAgentBet reverts
    // ---------------------------------------------------------------------

    function test_04_attestationExpired() public {
        address agent1 = address(0x1007);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 7, 0, 500_000_000_000_000, 1, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_301); // > expiresAt

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);

        vm.expectRevert(bytes("attestation expired"));
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        _writeCase("04_attestation_expired", string.concat('"', _hex(h1), '"'), "true", "null");
    }

    // ---------------------------------------------------------------------
    // 05: replay — identical attestation + signature submitted twice.
    // Since the 10_duplicateBetRejected guard (agentBets[...].amount == 0)
    // now runs before the usedAttestations[hash] check, and agentBets[...]
    // is never cleared once set, a second submission from the SAME agent on
    // the SAME market always hits "agent already bet on this market" first
    // — the replay is still correctly rejected, just via that earlier check
    // rather than "attestation already used" (which remains in place as
    // defense-in-depth, but is unreachable through this exact call pattern).
    // ---------------------------------------------------------------------

    function test_05_attestationReplay() public {
        address agent1 = address(0x1008);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 8, 0, 500_000_000_000_000, 1, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);

        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        vm.expectRevert(bytes("agent already bet on this market"));
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        mock.setMarket(MARKET_ID, 1_010_000, 100, 110, uint8(IStockPredictionMarket.MarketState.SETTLED));
        vm.prank(agent1);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent1.balance, 500_000_000_000_000);

        _writeCase(
            "05_attestation_replay",
            string.concat('"', _hex(h1), '"'),
            "true",
            _amountOrNull(500_000_000_000_000, true)
        );
    }

    // ---------------------------------------------------------------------
    // 06: wrong signer — well-formed attestation signed by a non-relayer key
    // ---------------------------------------------------------------------

    function test_06_wrongSigner() public {
        address agent1 = address(0x1009);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 9, 0, 500_000_000_000_000, 1, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(WRONG_SIGNER_PK, h1);

        vm.expectRevert(bytes("invalid attestation signature"));
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        _writeCase("06_wrong_signer", string.concat('"', _hex(h1), '"'), "false", "null");
    }

    // ---------------------------------------------------------------------
    // 07: amount exceeds maxBetSizeWei
    // ---------------------------------------------------------------------

    function test_07_amountExceedsMax() public {
        address agent1 = address(0x100A);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 10, 0, MAX_BET_SIZE_WEI + 1, 1, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);

        vm.deal(address(this), a1.amount);
        vm.expectRevert(bytes("exceeds max bet size"));
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        _writeCase("07_amount_exceeds_max", string.concat('"', _hex(h1), '"'), "true", "null");
    }

    // ---------------------------------------------------------------------
    // 08: multiple agents, mixed directions -> proportional payout
    // ---------------------------------------------------------------------

    function test_08_multiAgentProportional() public {
        address agent1 = address(0x100B);
        address agent2 = address(0x100C);
        address agent3 = address(0x100D);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 11, 0, 300_000_000_000_000, 1, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a2 = _mk(agent2, 12, 0, 200_000_000_000_000, 2, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a3 = _mk(agent3, 13, 1, 500_000_000_000_000, 3, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        bytes32 h2 = _hashAttestation(a2);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, h2);
        market.placeAgentBet{value: a2.amount}(a2, v2, r2, s2);

        bytes32 h3 = _hashAttestation(a3);
        (uint8 v3, bytes32 r3, bytes32 s3) = _sign(RELAYER_PK, h3);
        market.placeAgentBet{value: a3.amount}(a3, v3, r3, s3);

        mock.setMarket(MARKET_ID, 1_010_000, 100, 150, uint8(IStockPredictionMarket.MarketState.SETTLED));

        vm.prank(agent1);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent1.balance, 600_000_000_000_000);

        vm.prank(agent2);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent2.balance, 400_000_000_000_000);

        vm.prank(agent3);
        vm.expectRevert(bytes("bet did not win"));
        market.claimAgentWinnings(MARKET_ID);

        _writeCase(
            "08_multi_agent_proportional",
            string.concat('["', _hex(h1), '","', _hex(h2), '","', _hex(h3), '"]'),
            "true",
            string.concat(
                '{"', _addr(agent1), '":"600000000000000","',
                _addr(agent2), '":"400000000000000","',
                _addr(agent3), '":null}'
            )
        );
    }

    // ---------------------------------------------------------------------
    // 09: all agents on the winning side -> each gets back exactly their stake
    // ---------------------------------------------------------------------

    function test_09_soleSideFullRefund() public {
        address agent1 = address(0x100E);
        address agent2 = address(0x100F);
        address agent3 = address(0x1010);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 14, 0, 300_000_000_000_000, 1, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a2 = _mk(agent2, 15, 0, 300_000_000_000_000, 2, 1_000_000, 1_000_300);
        AgentStockMarket.Attestation memory a3 = _mk(agent3, 16, 0, 400_000_000_000_000, 3, 1_000_000, 1_000_300);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        bytes32 h2 = _hashAttestation(a2);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, h2);
        market.placeAgentBet{value: a2.amount}(a2, v2, r2, s2);

        bytes32 h3 = _hashAttestation(a3);
        (uint8 v3, bytes32 r3, bytes32 s3) = _sign(RELAYER_PK, h3);
        market.placeAgentBet{value: a3.amount}(a3, v3, r3, s3);

        mock.setMarket(MARKET_ID, 1_010_000, 100, 200, uint8(IStockPredictionMarket.MarketState.SETTLED));

        vm.prank(agent1);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent1.balance, 300_000_000_000_000);

        vm.prank(agent2);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent2.balance, 300_000_000_000_000);

        vm.prank(agent3);
        market.claimAgentWinnings(MARKET_ID);
        assertEq(agent3.balance, 400_000_000_000_000);

        _writeCase(
            "09_sole_side_full_refund",
            string.concat('["', _hex(h1), '","', _hex(h2), '","', _hex(h3), '"]'),
            "true",
            string.concat(
                '{"', _addr(agent1), '":"300000000000000","',
                _addr(agent2), '":"300000000000000","',
                _addr(agent3), '":"400000000000000"}'
            )
        );
    }

    // ---------------------------------------------------------------------
    // 10: same agent, same market, second placeAgentBet call rejected.
    // Pure access-control check (no payout math involved) -- not part of the
    // 9-case Independent Reference Model comparison; verified standalone here.
    // ---------------------------------------------------------------------

    function test_10_duplicateBetRejected() public {
        address agent1 = address(0x1011);
        AgentStockMarket.Attestation memory a1 = _mk(agent1, 17, 0, 300_000_000_000_000, 1, 1_000_000, 1_000_300);
        // Different nonce/issuedAt/expiresAt from a1, but same agentAddress and marketId.
        AgentStockMarket.Attestation memory a2 = _mk(agent1, 17, 0, 200_000_000_000_000, 2, 1_000_100, 1_000_400);

        mock.setMarket(MARKET_ID, 1_010_000, 0, 0, uint8(IStockPredictionMarket.MarketState.OPEN));
        vm.warp(1_000_000);

        bytes32 h1 = _hashAttestation(a1);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, h1);
        market.placeAgentBet{value: a1.amount}(a1, v1, r1, s1);

        bytes32 h2 = _hashAttestation(a2);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, h2);
        vm.expectRevert(bytes("agent already bet on this market"));
        market.placeAgentBet{value: a2.amount}(a2, v2, r2, s2);
    }
}
