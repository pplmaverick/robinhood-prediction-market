// scripts/reset-markets.js
// Phase 1：結算舊市場 #0/#1/#2（兩池都是 0 ETH，清除 OPEN 狀態）
// Phase 2：建新 TSLA/AMZN/PLTR 市場，closeTime = 7 天後
//
// 執行：npx hardhat run scripts/reset-markets.js --network robinhoodTestnet

const hre = require("hardhat");

const CONTRACT = "0x15636CE4C0EdE55335f84E6386f8F49C897c077d";

// 3 支股票：舊市場 ID + MockPriceFeed 地址 + 參考開盤價
const STOCKS = [
  {
    symbol:      "TSLA",
    token:       "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    priceFeed:   "0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f",
    refPrice:    18000000000n,   // $180.00（8 decimals）
    oldMarketId: 0,
  },
  {
    symbol:      "AMZN",
    token:       "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    priceFeed:   "0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953",
    refPrice:    18500000000n,   // $185.00
    oldMarketId: 1,
  },
  {
    symbol:      "PLTR",
    token:       "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    priceFeed:   "0xBdC53E50b1167cE1199bFaD54A034f7ab1741051",
    refPrice:    2500000000n,    // $25.00
    oldMarketId: 2,
  },
];

const MARKET_ABI = [
  "function lockMarket(uint256 marketId) external",
  "function settleMarket(uint256 marketId) external",
  "function createMarket(address stockToken, address priceFeed, string calldata symbol, uint256 duration) external returns (uint256)",
  "function marketCount() view returns (uint256)",
];

const PRICE_FEED_ABI = [
  "function setPrice(int256 newPrice) external",
];

const SEVEN_DAYS = 7 * 24 * 60 * 60; // 604800 seconds

async function waitTx(promise, label) {
  process.stdout.write(`    ${label}... `);
  const tx      = await promise;
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error(`${label} reverted!`);
  console.log(`✅ ${receipt.hash.slice(0, 14)}…`);
}

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log(`Owner : ${owner.address}`);

  const marketContract = new hre.ethers.Contract(CONTRACT, MARKET_ABI, owner);

  // ── Phase 1：結算舊市場 ──────────────────────────────────────────────────
  console.log("\n=== Phase 1：結算舊市場 #0 / #1 / #2 ===");
  for (const s of STOCKS) {
    console.log(`\n  [#${s.oldMarketId}] ${s.symbol}`);
    const feed = new hre.ethers.Contract(s.priceFeed, PRICE_FEED_ABI, owner);
    // lockMarket 和 settleMarket 都讀同一個 priceFeed 價格
    // 兩池皆為 0 → 結果不影響任何人資金
    await waitTx(feed.setPrice(s.refPrice),              `setPrice($${Number(s.refPrice) / 1e8})`);
    await waitTx(marketContract.lockMarket(s.oldMarketId),   "lockMarket  ");
    await waitTx(marketContract.settleMarket(s.oldMarketId), "settleMarket");
  }

  // ── Phase 2：建新市場 ────────────────────────────────────────────────────
  console.log("\n=== Phase 2：建新市場（closeTime = 7 天後）===");
  const newIds = [];
  for (const s of STOCKS) {
    console.log(`\n  [new] ${s.symbol}`);
    await waitTx(
      marketContract.createMarket(s.token, s.priceFeed, s.symbol, SEVEN_DAYS),
      `createMarket`
    );
    const newId = Number(await marketContract.marketCount()) - 1;
    newIds.push({ symbol: s.symbol, id: newId });
    console.log(`         → market ID = #${newId}`);
  }

  const closeDate = new Date(Date.now() + SEVEN_DAYS * 1000);
  console.log(`\n✅ 完成！`);
  console.log(`   新市場 IDs：${newIds.map(m => `${m.symbol}=#${m.id}`).join("  ")}`);
  console.log(`   結算時間：${closeDate.toLocaleString("zh-TW")}`);
  console.log(`\n   ⚠️  請把上面的 market IDs 記下來，填入 scripts/settle-new-markets.js`);
  console.log(`   7 天後執行：npx hardhat run scripts/settle-new-markets.js --network robinhoodTestnet`);
}

main().catch(e => { console.error(e); process.exit(1); });
