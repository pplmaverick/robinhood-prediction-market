// scripts/settle-new-markets.js
// 7 天後執行：lock + settle TSLA/AMZN/PLTR 新市場
//
// 執行前請：
//   1. 把 MARKET_IDS 填入 reset-markets.js 輸出的 ID
//   2. 把 CLOSE_PRICES 改成當天你查到的真實收盤價（或自訂）
//
// 執行：npx hardhat run scripts/settle-new-markets.js --network robinhoodTestnet

const hre = require("hardhat");

const CONTRACT = "0x15636CE4C0EdE55335f84E6386f8F49C897c077d";

// ⚠️  執行 reset-markets.js 後把輸出的 ID 填在這裡
const MARKETS = [
  {
    symbol:    "TSLA",
    marketId:  10,
    priceFeed: "0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f",
    openPrice:  18000000000n,                   // $180.00 (建市場時設的參考價)
    closePrice: 18500000000n,                   // $185.00 → BULL 贏（7天後改成真實價格）
  },
  {
    symbol:    "AMZN",
    marketId:  11,
    priceFeed: "0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953",
    openPrice:  18500000000n,                   // $185.00
    closePrice: 18000000000n,                   // $180.00 → BEAR 贏（7天後改成真實價格）
  },
  {
    symbol:    "PLTR",
    marketId:  12,
    priceFeed: "0xBdC53E50b1167cE1199bFaD54A034f7ab1741051",
    openPrice:  2500000000n,                    // $25.00
    closePrice: 2800000000n,                    // $28.00 → BULL 贏（7天後改成真實價格）
  },
];

const MARKET_ABI = [
  "function lockMarket(uint256 marketId) external",
  "function settleMarket(uint256 marketId) external",
];

const PRICE_FEED_ABI = [
  "function setPrice(int256 newPrice) external",
];

async function waitTx(promise, label) {
  process.stdout.write(`    ${label}... `);
  const tx      = await promise;
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error(`${label} reverted!`);
  console.log(`✅ ${receipt.hash.slice(0, 14)}…`);
}

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log(`Owner : ${owner.address}\n`);

  const marketContract = new hre.ethers.Contract(CONTRACT, MARKET_ABI, owner);

  for (const m of MARKETS) {
    console.log(`[#${m.marketId}] ${m.symbol}`);
    console.log(`  openPrice  = $${Number(m.openPrice)  / 1e8}`);
    console.log(`  closePrice = $${Number(m.closePrice) / 1e8}`);
    const result = m.closePrice >= m.openPrice ? "BULL 贏 ↑" : "BEAR 贏 ↓";
    console.log(`  結果預測  = ${result}`);

    const feed = new hre.ethers.Contract(m.priceFeed, PRICE_FEED_ABI, owner);

    // lockMarket 讀的是 latestRoundData() → 先設 openPrice 再 lock
    await waitTx(feed.setPrice(m.openPrice),              "setPrice(open) ");
    await waitTx(marketContract.lockMarket(m.marketId),   "lockMarket     ");

    // settleMarket 讀的是 latestRoundData() → 改成 closePrice 再 settle
    await waitTx(feed.setPrice(m.closePrice),             "setPrice(close)");
    await waitTx(marketContract.settleMarket(m.marketId), "settleMarket   ");

    console.log(`  → #${m.marketId} ${m.symbol} settled ✅\n`);
  }

  console.log("全部市場結算完成！使用者現在可以 claimWinnings。");
}

main().catch(e => { console.error(e); process.exit(1); });
