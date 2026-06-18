const hre = require("hardhat");

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log("Owner:", owner.address);

  const MARKET_ADDRESS = "0x15636CE4C0EdE55335f84E6386f8F49C897c077d";
  const market = await hre.ethers.getContractAt("StockPredictionMarket", MARKET_ADDRESS);

  const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");

  const feeds = {
    TSLA: { price: 18000000000n, newPrice: 19000000000n, token: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" },
    AMZN: { price: 18500000000n, newPrice: 19500000000n, token: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" },
    PLTR: { price: 2500000000n,  newPrice: 2800000000n,  token: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0" },
    NFLX: { price: 95000000000n, newPrice: 96000000000n, token: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93" },
    AMD:  { price: 17000000000n, newPrice: 18000000000n, token: "0x71178BAc73cBeb415514eB542a8995b82669778d" },
  };

  const results = [];

  for (const [symbol, config] of Object.entries(feeds)) {
    console.log(`\n=== ${symbol} ===`);

    const feed = await MockPriceFeed.deploy(config.price, 8);
    await feed.waitForDeployment();
    const feedAddr = await feed.getAddress();
    console.log(`${symbol} feed deployed:`, feedAddr);

    const tx1 = await market.createMarket(config.token, feedAddr, `${symbol}-E2E`, 60n);
    await tx1.wait();
    const marketId = BigInt(results.length + 4); // ID 4~8
    console.log(`createMarket tx:`, tx1.hash);

    const tx2 = await market.placeBet(marketId, 0, { value: hre.ethers.parseEther("0.001") });
    await tx2.wait();
    console.log(`placeBet tx:`, tx2.hash);

    results.push({ symbol, marketId, feedAddr, createMarket: tx1.hash, placeBet: tx2.hash, feed });
  }

  console.log("\n--- Waiting 65 seconds for all markets to close... ---");
  await new Promise(r => setTimeout(r, 65000));

  for (const r of results) {
    console.log(`\n=== ${r.symbol} settle ===`);

    const tx3 = await market.lockMarket(r.marketId);
    await tx3.wait();
    console.log(`lockMarket tx:`, tx3.hash);

    const tx4 = await r.feed.setPrice(feeds[r.symbol].newPrice);
    await tx4.wait();
    console.log(`setPrice tx:`, tx4.hash);

    const tx5 = await market.settleMarket(r.marketId);
    await tx5.wait();
    console.log(`settleMarket tx:`, tx5.hash);

    const tx6 = await market.claimWinnings(r.marketId);
    await tx6.wait();
    console.log(`claimWinnings tx:`, tx6.hash);

    r.lockMarket = tx3.hash;
    r.settleMarket = tx5.hash;
    r.claimWinnings = tx6.hash;
  }

  console.log("\n=== E2E Summary ===");
  for (const r of results) {
    console.log(`\n${r.symbol} (Market ID: ${r.marketId})`);
    console.log("  createMarket:", r.createMarket);
    console.log("  placeBet:", r.placeBet);
    console.log("  lockMarket:", r.lockMarket);
    console.log("  settleMarket:", r.settleMarket);
    console.log("  claimWinnings:", r.claimWinnings);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
