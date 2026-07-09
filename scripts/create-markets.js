const hre = require("hardhat");

// StockPredictionMarket（Robinhood Chain Mainnet, chainId 4663）
const MARKET_CONTRACT = "0x72DAb8B1B53b3CF028e9A0d1E21178981f264245";

const DURATION = 86400n; // 1 day

// 股票代幣 + ChainlinkPriceFeed wrapper 地址（皆為 mainnet，來源：README.md / deploy.js）
const MARKETS = [
  { symbol: "TSLA", token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", priceFeed: "0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f" },
  { symbol: "AMZN", token: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", priceFeed: "0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953" },
  { symbol: "PLTR", token: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", priceFeed: "0xBdC53E50b1167cE1199bFaD54A034f7ab1741051" },
  { symbol: "AMD",  token: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", priceFeed: "0x15636CE4C0EdE55335f84E6386f8F49C897c077d" },
  { symbol: "NVDA", token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", priceFeed: "0x914c40a644493b47336de847b0404E729e06C68d" },
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
