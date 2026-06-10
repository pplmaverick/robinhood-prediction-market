const hre = require("hardhat");

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log("Owner:", owner.address);

  const MARKET_ADDRESS = "0x15636CE4C0EdE55335f84E6386f8F49C897c077d";
  const TSLA_FEED = "0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f";

  const market = await hre.ethers.getContractAt("StockPredictionMarket", MARKET_ADDRESS);
  const feed = await hre.ethers.getContractAt("MockPriceFeed", TSLA_FEED);

  // 建立短期市場（60秒後關閉）
  console.log("\n--- Step 1: Create market ---");
  const tx1 = await market.createMarket(
    "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    TSLA_FEED,
    "TSLA-TEST",
    60n
  );
  await tx1.wait();
  const marketId = 3n; // 前面已建 0,1,2
  console.log("createMarket tx:", tx1.hash);

  // 下注 BULL
  console.log("\n--- Step 2: Place bet (BULL) ---");
  const tx2 = await market.placeBet(marketId, 0, { value: hre.ethers.parseEther("0.002") });
  await tx2.wait();
  console.log("placeBet tx:", tx2.hash);

  // 等 60 秒
  console.log("\n--- Waiting 65 seconds for market to close... ---");
  await new Promise(r => setTimeout(r, 65000));

  // lockMarket
  console.log("\n--- Step 3: Lock market ---");
  const tx3 = await market.lockMarket(marketId);
  await tx3.wait();
  console.log("lockMarket tx:", tx3.hash);

  // 改 mock price（模擬價格上漲，讓 BULL 贏）
  console.log("\n--- Step 4: Update mock price (price up) ---");
  const tx4 = await feed.setPrice(19000000000n); // $190
  await tx4.wait();
  console.log("setPrice tx:", tx4.hash);

  // settleMarket
  console.log("\n--- Step 5: Settle market ---");
  const tx5 = await market.settleMarket(marketId);
  await tx5.wait();
  console.log("settleMarket tx:", tx5.hash);

  // claimWinnings
  console.log("\n--- Step 6: Claim winnings ---");
  const tx6 = await market.claimWinnings(marketId);
  await tx6.wait();
  console.log("claimWinnings tx:", tx6.hash);

  console.log("\n=== Lifecycle Complete ===");
  console.log("createMarket:", tx1.hash);
  console.log("placeBet:", tx2.hash);
  console.log("lockMarket:", tx3.hash);
  console.log("setPrice:", tx4.hash);
  console.log("settleMarket:", tx5.hash);
  console.log("claimWinnings:", tx6.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
