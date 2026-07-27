// scripts/lock-only.js
// 對主網 Markets #15-19 只執行 lockMarket()，不執行 settleMarket()
// 每筆交易送出後都會等待鏈上確認，再送下一筆
//
// 執行：npx hardhat run scripts/lock-only.js --network robinhoodMainnet

const hre = require("hardhat");

const CONTRACT = "0x72DAb8B1B53b3CF028e9A0d1E21178981f264245";
const MARKET_IDS = [15, 16, 17, 18, 19];

const MARKET_ABI = [
  "function lockMarket(uint256 marketId) external",
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

    const lockHash = await waitTx(contract.lockMarket(id), "lockMarket   ");

    const after = await contract.markets(id);
    console.log(`  state after lock=${after.state}\n`);

    results.push({
      id,
      symbol: before.symbol,
      lockHash,
    });
  }

  console.log("=== 結果彙總（只 lock，未 settle）===");
  for (const r of results) {
    console.log(`#${r.id} ${r.symbol}: lock=${r.lockHash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
