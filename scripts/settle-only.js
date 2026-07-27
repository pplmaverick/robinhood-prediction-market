// scripts/settle-only.js
// 對主網 Markets #15-19 只執行 settleMarket()（前提：markets 已是 LOCKED 狀態）
// 每筆交易送出後都會等待鏈上確認，再送下一筆
//
// 執行：npx hardhat run scripts/settle-only.js --network robinhoodMainnet

const hre = require("hardhat");

const CONTRACT = "0x72DAb8B1B53b3CF028e9A0d1E21178981f264245";
const MARKET_IDS = [15, 16, 17, 18, 19];

const MARKET_ABI = [
  "function settleMarket(uint256 marketId) external",
  "function markets(uint256) view returns (address stockToken, address priceFeed, string symbol, uint256 roundId, uint256 openTime, uint256 closeTime, int256 openPrice, int256 closePrice, uint256 bullPool, uint256 bearPool, uint8 state)",
];

async function waitTx(promise, label) {
  process.stdout.write(`    ${label}... `);
  const tx = await promise;
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error(`${label} reverted!`);
  console.log(`✅ ${receipt.hash}`);
  return receipt.hash;
}

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log(`Owner : ${owner.address}\n`);

  const contract = new hre.ethers.Contract(CONTRACT, MARKET_ABI, owner);
  const results = [];

  for (const id of MARKET_IDS) {
    const before = await contract.markets(id);
    console.log(`[#${id}] ${before.symbol} state=${before.state}`);

    const settleHash = await waitTx(contract.settleMarket(id), "settleMarket ");

    const after = await contract.markets(id);
    const winner = after.closePrice >= after.openPrice ? "BULL" : "BEAR";
    console.log(`  openPrice=${after.openPrice}  closePrice=${after.closePrice}  winner=${winner}\n`);

    results.push({
      id,
      symbol: before.symbol,
      settleHash,
      openPrice: after.openPrice.toString(),
      closePrice: after.closePrice.toString(),
      winner,
    });
  }

  console.log("=== 結果彙總 ===");
  for (const r of results) {
    console.log(`#${r.id} ${r.symbol}: settle=${r.settleHash} open=${r.openPrice} close=${r.closePrice} winner=${r.winner}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
