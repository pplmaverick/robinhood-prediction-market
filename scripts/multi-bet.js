const hre = require("hardhat");

const CONTRACT   = "0x15636CE4C0EdE55335f84E6386f8F49C897c077d";
const TSLA_TOKEN = "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E";

// TSLA 初始與收盤模擬價格（8 decimals, $180.00 → $189.00, +5%）
const TSLA_OPEN_PRICE  = 18000000000n; // $180.00
const TSLA_CLOSE_PRICE = 18900000000n; // $189.00 → closePrice > openPrice → BULL wins

const BET_AMOUNT  = hre.ethers.parseEther("0.001");
const FUND_AMOUNT = hre.ethers.parseEther("0.003"); // 0.001 bet + 0.002 gas buffer
const FEE_BPS     = 200n;                           // 合約固定 2%

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitTx(tx, label) {
  process.stdout.write(`  Sending ${label}... `);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error(`❌ ${label} failed! hash: ${tx.hash}`);
  console.log(`✅  ${receipt.hash}`);
  return receipt;
}

async function main() {
  const [owner] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  console.log("====================================================");
  console.log("        Multi-Bet Simulation (Robinhood Testnet)");
  console.log("====================================================");
  console.log("Owner:", owner.address);

  // ── 1. 建立 3 個臨時錢包 ────────────────────────────────────────────
  console.log("\n[1/8] 建立臨時錢包...");
  const bettor1 = hre.ethers.Wallet.createRandom().connect(provider);
  const bettor2 = hre.ethers.Wallet.createRandom().connect(provider);
  const bettor3 = hre.ethers.Wallet.createRandom().connect(provider);

  console.log("  bettor1 (BULL):", bettor1.address);
  console.log("  bettor2 (BULL):", bettor2.address);
  console.log("  bettor3 (BEAR):", bettor3.address);

  // ── 2. 各轉 0.003 ETH（含 gas buffer）─────────────────────────────
  console.log("\n[2/8] 從 dev wallet 轉帳...");
  await waitTx(await owner.sendTransaction({ to: bettor1.address, value: FUND_AMOUNT }), `fund bettor1 ${hre.ethers.formatEther(FUND_AMOUNT)} ETH`);
  await waitTx(await owner.sendTransaction({ to: bettor2.address, value: FUND_AMOUNT }), `fund bettor2 ${hre.ethers.formatEther(FUND_AMOUNT)} ETH`);
  await waitTx(await owner.sendTransaction({ to: bettor3.address, value: FUND_AMOUNT }), `fund bettor3 ${hre.ethers.formatEther(FUND_AMOUNT)} ETH`);

  // ── 3. 確認餘額 ─────────────────────────────────────────────────────
  console.log("\n[3/8] 確認餘額...");
  const [b1Pre, b2Pre, b3Pre] = await Promise.all([
    provider.getBalance(bettor1.address),
    provider.getBalance(bettor2.address),
    provider.getBalance(bettor3.address),
  ]);
  console.log(`  bettor1: ${hre.ethers.formatEther(b1Pre)} ETH`);
  console.log(`  bettor2: ${hre.ethers.formatEther(b2Pre)} ETH`);
  console.log(`  bettor3: ${hre.ethers.formatEther(b3Pre)} ETH`);

  // ── 4. 部署 MockPriceFeed + 建立市場 ────────────────────────────────
  console.log("\n[4/8] 部署 MockPriceFeed + createMarket...");
  const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy(TSLA_OPEN_PRICE, 8);
  await priceFeed.waitForDeployment();
  const feedAddr = await priceFeed.getAddress();
  console.log("  MockPriceFeed:", feedAddr);
  console.log("  初始 TSLA 價格:", hre.ethers.formatUnits(TSLA_OPEN_PRICE, 8), "USD");

  const market = await hre.ethers.getContractAt("StockPredictionMarket", CONTRACT);

  // 30 秒後可以 lockMarket，時間夠短又夠放 3 個 bet
  const DURATION = 30n;
  await waitTx(
    await market.createMarket(TSLA_TOKEN, feedAddr, "TSLA-MULTI", DURATION),
    "createMarket"
  );

  const marketId = (await market.marketCount()) - 1n;
  const mInfo    = await market.markets(marketId);
  console.log(`  Market ID: ${marketId}`);
  console.log(`  closeTime: ${new Date(Number(mInfo.closeTime) * 1000).toISOString()}`);

  // ── 5. 三個 bettor 下注 ──────────────────────────────────────────────
  console.log("\n[5/8] 下注...");
  const m1 = market.connect(bettor1);
  const m2 = market.connect(bettor2);
  const m3 = market.connect(bettor3);

  await waitTx(await m1.placeBet(marketId, 0, { value: BET_AMOUNT }), "bettor1 BULL 0.001 ETH");
  await waitTx(await m2.placeBet(marketId, 0, { value: BET_AMOUNT }), "bettor2 BULL 0.001 ETH");
  await waitTx(await m3.placeBet(marketId, 1, { value: BET_AMOUNT }), "bettor3 BEAR 0.001 ETH");

  const [b1PostBet, b2PostBet, b3PostBet] = await Promise.all([
    provider.getBalance(bettor1.address),
    provider.getBalance(bettor2.address),
    provider.getBalance(bettor3.address),
  ]);
  console.log("  下注後餘額:");
  console.log(`    bettor1: ${hre.ethers.formatEther(b1PostBet)} ETH (減少 ${hre.ethers.formatEther(b1Pre - b1PostBet)} ETH incl. gas)`);
  console.log(`    bettor2: ${hre.ethers.formatEther(b2PostBet)} ETH (減少 ${hre.ethers.formatEther(b2Pre - b2PostBet)} ETH incl. gas)`);
  console.log(`    bettor3: ${hre.ethers.formatEther(b3PostBet)} ETH (減少 ${hre.ethers.formatEther(b3Pre - b3PostBet)} ETH incl. gas)`);

  // ── 6. 等待 closeTime，然後 lock → setPrice → settle ────────────────
  const closeTime  = Number(mInfo.closeTime);
  const nowSecs    = Math.floor(Date.now() / 1000);
  const waitSecs   = Math.max(closeTime - nowSecs + 5, 5); // +5s buffer
  console.log(`\n[6/8] 等待市場關閉（${waitSecs}s）...`);
  await sleep(waitSecs * 1000);

  await waitTx(await market.lockMarket(marketId), "lockMarket (snapshot openPrice)");
  console.log(`  openPrice 已鎖定: ${hre.ethers.formatUnits(TSLA_OPEN_PRICE, 8)} USD`);

  // 調高價格 → BULL 勝（closePrice > openPrice）
  await waitTx(await priceFeed.setPrice(TSLA_CLOSE_PRICE), `setPrice → ${hre.ethers.formatUnits(TSLA_CLOSE_PRICE, 8)} USD (+5%)`);
  await waitTx(await market.settleMarket(marketId), "settleMarket → BULL wins");

  // ── 7. bettor1、bettor2 領獎 ─────────────────────────────────────────
  console.log("\n[7/8] 領取獎金...");
  const b1BeforeClaim = await provider.getBalance(bettor1.address);
  await waitTx(await m1.claimWinnings(marketId), "bettor1 claimWinnings");
  const b1AfterClaim  = await provider.getBalance(bettor1.address);

  const b2BeforeClaim = await provider.getBalance(bettor2.address);
  await waitTx(await m2.claimWinnings(marketId), "bettor2 claimWinnings");
  const b2AfterClaim  = await provider.getBalance(bettor2.address);

  // bettor3 是輸家，無法 claim（預期 revert）
  console.log("  bettor3 (BEAR) 嘗試 claim（預期失敗）...");
  try {
    await (await m3.claimWinnings(marketId)).wait();
    console.log("  ⚠️  bettor3 claim 沒有 revert（意外）");
  } catch (e) {
    console.log("  ✅  bettor3 claim 正確 revert:", e.reason ?? e.shortMessage ?? "Lost");
  }

  // ── 8. 分析與驗證 ───────────────────────────────────────────────────
  console.log("\n[8/8] 分析結果...");

  // 從事件讀取實際 payout
  const claimFilter = market.filters.WinningsClaimed(marketId);
  const claimEvents = await market.queryFilter(claimFilter);
  const payouts     = Object.fromEntries(
    claimEvents.map(e => [e.args.user.toLowerCase(), e.args.amount])
  );

  const bullPool     = BET_AMOUNT * 2n;          // 0.002 ETH
  const bearPool     = BET_AMOUNT;               // 0.001 ETH
  const totalPool    = bullPool + bearPool;       // 0.003 ETH
  const fee          = (totalPool * FEE_BPS) / 10000n;
  const netPool      = totalPool - fee;
  const expectedEach = (netPool * BET_AMOUNT) / bullPool;

  console.log("");
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log("│              Parimutuel 分配計算                    │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log(`│ BULL pool   = ${hre.ethers.formatEther(bullPool)} ETH (bettor1 + bettor2)    │`);
  console.log(`│ BEAR pool   = ${hre.ethers.formatEther(bearPool)} ETH (bettor3)              │`);
  console.log(`│ Total pool  = ${hre.ethers.formatEther(totalPool)} ETH                         │`);
  console.log(`│ Fee (2%)    = ${hre.ethers.formatEther(fee)} ETH                        │`);
  console.log(`│ Net pool    = ${hre.ethers.formatEther(netPool)} ETH                       │`);
  console.log(`│ 每人應得    = netPool × bet / bullPool               │`);
  console.log(`│             = ${hre.ethers.formatEther(expectedEach)} ETH                     │`);
  console.log("└─────────────────────────────────────────────────────┘");
  console.log("");

  console.log("┌─────────────────────────────────────────────────────┐");
  console.log("│              實際 Claim 結果 vs 預期                │");
  console.log("├──────────────┬─────────────┬─────────────┬─────────┤");
  console.log("│ Bettor       │ 預期 (ETH)  │ 實際 (ETH)  │ 誤差    │");
  console.log("├──────────────┼─────────────┼─────────────┼─────────┤");

  let allPass = true;
  for (const [addr, actual] of Object.entries(payouts)) {
    const diff    = actual > expectedEach ? actual - expectedEach : expectedEach - actual;
    const pctNum  = Number(diff * 100000n / expectedEach) / 1000; // 3 decimal places
    const ok      = pctNum < 5;
    if (!ok) allPass = false;
    const label   = addr === bettor1.address.toLowerCase() ? "bettor1 (BULL)" : "bettor2 (BULL)";
    console.log(`│ ${label.padEnd(12)} │ ${hre.ethers.formatEther(expectedEach).padEnd(11)} │ ${hre.ethers.formatEther(actual).padEnd(11)} │ ${(pctNum.toFixed(2) + "%").padEnd(7)} ${ok ? "✅" : "❌"} │`);
  }
  console.log("└──────────────┴─────────────┴─────────────┴─────────┘");

  console.log("");
  console.log("====================================================");
  console.log("  最終餘額總覽");
  console.log("====================================================");
  const fmtDiff = (after, before) => {
    const d = after - before;
    const sign = d >= 0n ? "+" : "-";
    return `${sign}${hre.ethers.formatEther(d < 0n ? -d : d)} ETH`;
  };
  console.log(`  bettor1: ${hre.ethers.formatEther(b1AfterClaim)} ETH  (淨: ${fmtDiff(b1AfterClaim, b1Pre)})`);
  console.log(`  bettor2: ${hre.ethers.formatEther(b2AfterClaim)} ETH  (淨: ${fmtDiff(b2AfterClaim, b2Pre)})`);
  console.log(`  bettor3: ${hre.ethers.formatEther(b3PostBet)} ETH     (淨: ${fmtDiff(b3PostBet, b3Pre)}) [輸家，未 claim]`);

  console.log("");
  if (allPass) {
    console.log("🎉  驗證通過：所有 payout 誤差 < 5%，Parimutuel 邏輯正確！");
  } else {
    console.log("⚠️  驗證失敗：部分 payout 誤差 >= 5%，請檢查合約邏輯。");
    process.exit(1);
  }
}

main().catch((e) => { console.error("\n❌ 腳本執行失敗:", e); process.exit(1); });
