const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Robinhood Chain Testnet stock token addresses (official)
  const STOCK_TOKENS = {
    TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
    AMD:  "0x71178BAc73cBeb415514eB542a8995b82669778d",
  };

  // Deploy MockPriceFeed for each stock (price in USD, 8 decimals)
  // TSLA ~$180, AMZN ~$185, PLTR ~$25 (testnet mock values)
  const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");
  const tslaMock = await MockPriceFeed.deploy(18000000000n, 8); // $180.00
  await tslaMock.waitForDeployment();
  console.log("TSLA MockPriceFeed:", await tslaMock.getAddress());

  const amznMock = await MockPriceFeed.deploy(18500000000n, 8); // $185.00
  await amznMock.waitForDeployment();
  console.log("AMZN MockPriceFeed:", await amznMock.getAddress());

  const pltrMock = await MockPriceFeed.deploy(2500000000n, 8); // $25.00
  await pltrMock.waitForDeployment();
  console.log("PLTR MockPriceFeed:", await pltrMock.getAddress());

  const nflxMock = await MockPriceFeed.deploy(95000000000n, 8); // $950.00
  await nflxMock.waitForDeployment();
  console.log("NFLX MockPriceFeed:", await nflxMock.getAddress());

  const amdMock = await MockPriceFeed.deploy(17000000000n, 8); // $170.00
  await amdMock.waitForDeployment();
  console.log("AMD MockPriceFeed:", await amdMock.getAddress());

  // Deploy main contract
  const Market = await hre.ethers.getContractFactory("StockPredictionMarket");
  const market = await Market.deploy({ gasLimit: 5000000n });
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log("StockPredictionMarket:", marketAddr);

  // Create initial markets (1 hour duration)
  const duration = 3600n;
  await market.createMarket(STOCK_TOKENS.TSLA, await tslaMock.getAddress(), "TSLA", duration);
  console.log("TSLA market created (ID: 0)");
  await market.createMarket(STOCK_TOKENS.AMZN, await amznMock.getAddress(), "AMZN", duration);
  console.log("AMZN market created (ID: 1)");
  await market.createMarket(STOCK_TOKENS.PLTR, await pltrMock.getAddress(), "PLTR", duration);
  console.log("PLTR market created (ID: 2)");
  await market.createMarket(STOCK_TOKENS.NFLX, await nflxMock.getAddress(), "NFLX", duration);
  console.log("NFLX market created");
  await market.createMarket(STOCK_TOKENS.AMD, await amdMock.getAddress(), "AMD", duration);
  console.log("AMD market created");

  console.log("\n=== Deployment Summary ===");
  console.log("StockPredictionMarket:", marketAddr);
  console.log("TSLA feed:", await tslaMock.getAddress());
  console.log("AMZN feed:", await amznMock.getAddress());
  console.log("PLTR feed:", await pltrMock.getAddress());
  console.log("NFLX feed:", await nflxMock.getAddress());
  console.log("AMD feed:", await amdMock.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
