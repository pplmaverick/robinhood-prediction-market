const hre = require("hardhat");

// StockPredictionMarket 合約地址（依 --network 自動選擇）
const CONTRACT_ADDRESSES = {
  robinhoodMainnet: "0x72DAb8B1B53b3CF028e9A0d1E21178981f264245",
  robinhoodTestnet: "0x15636CE4C0EdE55335f84E6386f8F49C897c077d", // fallback
};

const ABI = [
  "function marketCount() view returns (uint256)",
  "function markets(uint256) view returns (address stockToken, address priceFeed, string symbol, uint8 direction, uint64 openTime, uint64 closeTime, int256 openPrice, int256 closePrice, uint256 bullPool, uint256 bearPool, uint8 state)"
];

async function main() {
  const networkName = hre.network.name;
  const contractAddress = CONTRACT_ADDRESSES[networkName];
  if (!contractAddress) {
    throw new Error(`未知的 network "${networkName}"，請在 CONTRACT_ADDRESSES 補上對應合約地址`);
  }

  console.log(`Network: ${networkName}`);
  console.log(`Contract: ${contractAddress}`);

  const contract = new hre.ethers.Contract(contractAddress, ABI, hre.ethers.provider);
  const count = await contract.marketCount();
  console.log(`Total markets: ${count}`);
  const STATE = ['OPEN', 'LOCKED', 'SETTLED'];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < Number(count); i++) {
    const m = await contract.markets(i);
    const closeTime = Number(m.closeTime);
    const diff = closeTime - now;
    const timeStr = diff > 0 ? `closes in ${Math.floor(diff/60)}m ${diff%60}s` : `closed ${Math.floor(-diff/60)}m ${-diff%60}s ago`;
    console.log(`#${i} ${m.symbol.padEnd(8)} state=${STATE[Number(m.state)].padEnd(8)} bull=${hre.ethers.formatEther(m.bullPool).slice(0,8)} ETH  bear=${hre.ethers.formatEther(m.bearPool).slice(0,8)} ETH  ${timeStr}`);
  }
}
main().catch(console.error);
