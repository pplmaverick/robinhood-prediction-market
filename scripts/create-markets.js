const hre = require("hardhat");

// StockPredictionMarket（Robinhood Chain Mainnet, chainId 4663）
const MARKET_CONTRACT = "0x72DAb8B1B53b3CF028e9A0d1E21178981f264245";

const DURATION = 1209600n; // 14 days

// 股票代幣 + ChainlinkPriceFeed wrapper 地址（皆為 mainnet，來源：README.md / deploy.js）
const MARKETS = [
  { symbol: "PLTR", token: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", priceFeed: "0xBdC53E50b1167cE1199bFaD54A034f7ab1741051" },
  { symbol: "AMD",  token: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", priceFeed: "0x15636CE4C0EdE55335f84E6386f8F49C897c077d" },
];

const ABI = [
  "function createMarket(address stockToken, address priceFeed, string calldata symbol, uint256 duration) external returns (uint256)",
  "function marketCount() view returns (uint256)",
];

async function main() {
  if (hre.network.name !== "robinhoodMainnet") {
    throw new Error(`此腳本內的地址僅適用 robinhoodMainnet，目前 network 為 "${hre.network.name}"`);
  }

  const [owner] = await hre.ethers.getSigners();
  console.log(`Owner: ${owner.address}`);
  console.log(`Contract: ${MARKET_CONTRACT}`);

  const market = new hre.ethers.Contract(MARKET_CONTRACT, ABI, owner);

  for (const m of MARKETS) {
    console.log(`\n[${m.symbol}] createMarket...`);
    const tx = await market.createMarket(m.token, m.priceFeed, m.symbol, DURATION);
    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error(`${m.symbol} createMarket 交易失敗（reverted）`);
    }
    const marketId = Number(await market.marketCount()) - 1;
    console.log(`  market ID = #${marketId}`);
    console.log(`  tx hash   = ${receipt.hash}`);
  }

  console.log("\n✅ 5 個市場建立完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
