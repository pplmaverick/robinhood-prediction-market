// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {AgentStockMarket} from "../contracts/AgentStockMarket.sol";

/// @notice Deploys AgentStockMarket. Run with --sender and WITHOUT --broadcast
/// for a dry-run simulation only; add --broadcast (and a real signer) to
/// actually send the deployment transaction -- not done as part of this task.
contract DeployAgentStockMarket is Script {
    // Production relayer identity (relayer/.env's RELAYER_ADDRESS), NOT the
    // ephemeral test-only keys used under verification/.
    address constant RELAYER_ADDRESS = 0x67BBA560662eca86421BfD6Bb680ce228542defE;
    address constant SOURCE_MARKET = 0x72DAb8B1B53b3CF028e9A0d1E21178981f264245;
    // Must match decision-engine/src/config.js's MAX_BET_SIZE_WEI at deploy time
    // (re-checked live for this script: still 1000000000000000 / 0.001 ETH).
    uint256 constant MAX_BET_SIZE_WEI = 1_000_000_000_000_000;

    function run() external returns (AgentStockMarket market) {
        vm.startBroadcast();
        market = new AgentStockMarket(RELAYER_ADDRESS, SOURCE_MARKET, MAX_BET_SIZE_WEI);
        vm.stopBroadcast();
    }
}
