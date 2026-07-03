const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Robinhood Chain Mainnet stock token addresses (official, from
  // docs.robinhood.com/chain/contracts, cross-checked on-chain via eth_getCode
  // and Blockscout is_verified_via_admin_panel=true)
  const STOCK_TOKENS = {
    TSLA: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    AMZN: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    PLTR: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A",
    AMD:  "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC",
    NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  };

  // Chainlink Data Feed proxy addresses on Robinhood Chain Mainnet (chainId 4663).
  // Verified on-chain via description()/aggregator()/latestRoundData() eth_calls,
  // not taken from documentation alone.
  const CHAINLINK_FEEDS = {
    TSLA: "0x4A1166a659A55625345e9515b32adECea5547C38",
    AMZN: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
    PLTR: "0x820ABedFF239034956B7A9d2F0a331f9F075eB4c",
    AMD:  "0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72",
    NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  };

  // Equity feeds only update during market hours; allow up to 3 days of
  // staleness so weekend/holiday closures don't brick lockMarket/settleMarket.
  const MAX_STALENESS_SECONDS = 3n * 24n * 60n * 60n;

  const ChainlinkPriceFeed = await hre.ethers.getContractFactory("ChainlinkPriceFeed");
  const feedWrappers = {};
  for (const symbol of Object.keys(CHAINLINK_FEEDS)) {
    const wrapper = await ChainlinkPriceFeed.deploy(CHAINLINK_FEEDS[symbol], MAX_STALENESS_SECONDS);
    await wrapper.waitForDeployment();
    feedWrappers[symbol] = await wrapper.getAddress();
    console.log(`${symbol} ChainlinkPriceFeed wrapper:`, feedWrappers[symbol]);
  }

  // Deploy main contract
  const Market = await hre.ethers.getContractFactory("StockPredictionMarket");
  const market = await Market.deploy({ gasLimit: 5000000n });
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log("StockPredictionMarket:", marketAddr);

  // Create initial markets (1 hour duration)
  const duration = 3600n;
  let marketId = 0;
  for (const symbol of Object.keys(STOCK_TOKENS)) {
    await market.createMarket(STOCK_TOKENS[symbol], feedWrappers[symbol], symbol, duration);
    console.log(`${symbol} market created (ID: ${marketId})`);
    marketId++;
  }

  console.log("\n=== Deployment Summary ===");
  console.log("StockPredictionMarket:", marketAddr);
  for (const symbol of Object.keys(STOCK_TOKENS)) {
    console.log(`${symbol} feed wrapper:`, feedWrappers[symbol]);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
