# 調查報告 0903 更新版：複查 0901 五項風險 + Genesis Round 完整清單 + 外部資料源 + 競品掃描

調查日期：2026-09-03（唯讀調查，未寫入任何 .ts/.sol/.js 業務邏輯、未跑測試、未修改任何合約/前端/後端/agent 程式碼；npm view / gh 僅用於版本與 PR 狀態查詢，未新增任何專案相依套件）

用途：延續 `RESEARCH_NOTES_x402_agentkit_0901.md`（該檔案保留不動，作為歷史記錄，本檔不覆蓋它），複查該筆記結尾列出的 5 項「9/4 需重新確認」風險，並新增 Part B（genesis round 完整清單 + 與真實交易比對）、Part C（Arbitrum Open House Singapore 用資料源調查，與本 repo 無關）、Part D（競品掃描）。

本次調查方式：4 條並行調查線（x402/AgentKit 網路調查、Chainlink 鏈上調查、外部資料源網路調查、競品掃描），全部使用真實工具（`npm view`、`gh pr view`/`gh api`、`cast call`/`cast logs`、`curl`、WebSearch/WebFetch）即時查詢，非依賴訓練記憶。

---

## Part A：複查 0901 筆記列出的 5 項風險

### A.1 — x402 版本落差（`@x402/fetch` / `@x402/evm`）

**結論：與 9/1 相比無變化。**

- `npm view @x402/fetch version` → **2.24.0**
- `npm view @x402/evm version` → **2.24.0**
- npm 上兩個套件目前最高版本都還是 2.24.0，跟 0901 筆記記錄的「9/1 當下最新版」完全一致——**這 2 天沒有再往上跳版**。`client-x402` 的 `package.json` 仍鎖定 `^2.8.0`，16 個 minor 版本的落差維持不變（靜態落差，非持續擴大）。
- 原始碼來源確認：`npm view @x402/fetch repository` → `https://github.com/x402-foundation/x402`（monorepo，非獨立 repo）。
- 該 monorepo 用 changesets 風格版本管理，`typescript/packages/` 下多個套件共用版本紀錄，沒有乾淨對應到單一套件版本號的 GitHub Releases 條目可供逐版 diff。既然版本號本身這兩天沒變，也就沒有新的 diff 可看——0901 筆記描述的風險（`client-x402` 從未針對 2.9~2.24 任何 breaking change 重新測試過）**維持原狀，沒有惡化也沒有解除**。

**Verdict：CONFIRMS 0901 NOTE UNCHANGED**

---

### A.2 — The Graph testnet gateway

**結論：找到 0901 筆記「打不通」的根本原因——是 hostname 前後順序寫反了，不是 gateway 或 subgraph 本身有問題。**

- 0901 筆記嘗試的 `testnet.gateway.thegraph.com` → 這次用 `curl` 驗證：`Could not resolve host`；`dig` 確認**這個子網域根本沒有 DNS 紀錄**，不存在。
- 反過來試 `gateway.testnet.thegraph.com`（前後順序對調）→ 可解析（跟 production 的 `gateway.thegraph.com` 同一組 Cloudflare IP），**確實是活的**。
- 用一個真實、目前有在 index 的 Base Sepolia subgraph（`HMc8skzQZHp5vLTMdXfdDBNnHDBGf1p1TJwW6HenjNcz`，Graph Explorer testnet 清單上的 "Uniswap V3 Base Sepolia"）發送真實請求：

```
POST https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/HMc8skzQZHp5vLTMdXfdDBNnHDBGf1p1TJwW6HenjNcz
→ HTTP/2 402，Content-Length: 0，payment-required header 存在（跟 production 同樣的格式）
```

解碼後：
```json
{
  "x402Version": 2,
  "error": "Payment-Signature header is required",
  "resource": { "url": "http://gateway.testnet.thegraph.com/subgraphs/id/HMc8skzQZHp5vLTMdXfdDBNnHDBGf1p1TJwW6HenjNcz" },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "42",
    "payTo": "0x301672eEf23F0e5f165cfba26762702F20A74430",
    "maxTimeoutSeconds": 300,
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "extra": { "assetTransferMethod": "eip3009", "name": "USDC", "version": "2" }
  }]
}
```

- **協議版本跟 production 一致**：v2、header-based、`accepts[]` 結構、EIP-3009 `extra` 區塊格式完全相同。
- 跟 production 的差異：`network` 是 `eip155:84532`（Base Sepolia，符合預期）而非 `eip155:8453`；`amount` 是 `"42"`（即 $0.000042，測試用的極小面額）而非 production 的 `"10000"`（$0.01）；`payTo`/`asset` 是 Base Sepolia 專屬位址（測試網 USDC 合約 `0x036CbD53842c5426634e7929541eC2318f3dCF7e`，非真實 Base USDC）。
- **⚠️ 9/4 待辦（新發現，非本次調查範圍內處理完）**：`client-x402` 套件內 `chains.ts` 的 `CHAIN_IDS`/base-URL 組合邏輯，若把 `X402_CHAIN=base-sepolia` 硬寫成 `testnet.gateway.thegraph.com` 這個前後順序，該套件本身的 testnet 支援就會是壞的——這次調查沒有深入追進套件原始碼確認實際組出來的 URL 是哪個順序，9/4 若要用 testnet 開發，第一步應該先讀一次 `chains.ts` 確認它組的 host 是不是也寫反了。

**Verdict：UPDATES 0901 NOTE** — testnet gateway 本身沒問題，是 0901 筆記猜測的 hostname 順序錯了；已用真實子網域打通並記錄下正確 host。

---

### A.3 — World AgentKit PR #36 / #39 / #42 狀態（本輪調查最高優先項目）

**結論：風險存在但時間軸比 0901 筆記假設的更遠——目前 `main` 分支與 npm 上能裝到的版本都還沒變。**

即時 `gh pr view` 查詢結果：

| PR | 標題 | 狀態 | 是否合併 | 合併進哪個分支 |
|---|---|---|---|---|
| #36 | fix: consume replay nonces atomically | **OPEN** | 否 | — |
| #39 | Sign requests with RFC 9421 HTTP Message Signatures | **MERGED**（2026-09-01T16:43:28Z） | 是 | **`new-cli`**，不是 `main` |
| #42 | feat: make signatures single-use with a nonce | **CLOSED**（2026-08-27T21:05:49Z） | 否（unmerged 關閉，未附說明） | stacked on #39 |

**「合併/未合併」這個框架本身會誤導人——關鍵細節在於合併進了哪裡：**

- #39 合併進了一個叫 `new-cli` 的側分支（head `rfc9421-signatures`），而 `new-cli` 本身是另一個**仍是 open 狀態的 breaking-change PR #38**（"feat!: agentkit cli v0.2"）的整合分支。`new-cli` **尚未合併進 `main`**。
- 直接 diff 原始碼確認：`main` 分支的 `core/src/validate.ts`、`core/src/verify.ts` **現在**仍是跟 0901 筆記記錄的完全一樣的 SIWE-based 介面——`validateAgentkitMessage(message, expectedResourceUri, { maxAge, checkNonce })`、`verifyAgentkitSignature(payload, options)`、`message.domain`/`message.uri`/`message.nonce` 欄位，全部沒變。
- `x402/src/client.ts`、`x402/src/server.ts` 在 `main` 上仍使用 `formatSIWEMessage`、`AGENTKIT` extension key、base64-JSON 的 `AgentkitPayload`——**不是** RFC 9421 headers。
- **npm 上發布的 `@worldcoin/agentkit-core` 仍是 0.2.1**（2026-08-24 發布，比 #39 開 PR 的時間還早）——代表今天 `npm install` 裝到的還是舊介面，跟合併狀態無關。
- 新介面**確實存在**，但只在 `new-cli` 分支上：該分支的 `core/src/index.ts` 匯出 `verify`、`verifyRequest`、`createSignatureHeaders`（取代 `verifyAgentkitSignature`/`formatSIWEMessage`）；`x402/src/protocol.ts` 定義新的 header 為 `Signature-Input`、`Signature`、`Content-Digest`（RFC 9421 + RFC 9530），已直接 fetch 該分支原始碼確認。該分支的協議程式碼裡**完全沒有 nonce 欄位**——跟 PR #39 自己的說明一致（"this PR deliberately ships without a nonce... follow-up PR to add nonce support"），而那個後續 PR（#42）在 #39 併進 `new-cli` 之前就已經 unmerged 關閉。**目前沒有任何替代的 nonce PR**（查過完整 PR 清單，沒有比 #42 更新、觸碰 nonce/replay 的項目）。

**對風險的實際影響**：比 0901 筆記假設的「近期風險」要低——目前沒有任何東西併進 `main` 或發布到 npm，所以照著 0901 筆記記錄的 SIWE/`checkNonce` 介面寫的程式碼，在 9/4 之前應該都還能正常運作，除非有人刻意去 checkout `new-cli` 分支或未來 npm 出了 major 版本更新。但這確認了介面斷裂是**真實存在、即將發生、且跟另一個 breaking change（CLI v0.2，PR #38，同樣還是 open）綁在一起**——真正落地那天，SIWE header 格式、`verifyAgentkitSignature`、`validateAgentkitMessage`、`formatSIWEMessage`、`checkNonce` 會一次全部換掉，換成 `verify`/`verifyRequest`/`createSignatureHeaders` 和三個新 HTTP header，而且截至今天**仍然沒有 nonce/replay 保護機制**被併入新方案。

**`lookupHuman` RPC-failure-vs-unregistered 問題**：`core/src/agent-book.ts` 自 commit `b31b4b720`（2026-04-13，"feat: remove chain and add release (#18)"）後**沒有任何改動**——#36/#39/#42 都沒碰到這個檔案，也沒有其他 commit 處理過。0901 筆記引用的 poh-aggregator 三態修正法，目前仍是唯一已知的解法，上游尚未處理。

**Verdict：UPDATES 0901 NOTE（重大更新）** — #39 已合併但不在 `main`/npm 上；風險時間軸應理解成「即將到來、跟 CLI v0.2 綁在一起」而非「可能已經上線」。新介面的完整樣貌（在 `new-cli` 分支上）本次首次完整記錄下來。

---

### A.4 — Chainlink 5 個 feed 存活複查

**結論：全部存活，跟 0901 筆記一致，無變化。**

即時查詢時間 **2026-09-03 05:19:43 UTC**，對象是 `scripts/deploy.js` `CHAINLINK_FEEDS` 的 5 個 PROXY 位址：

| Symbol | Feed 位址 | decimals | answer | 價格 | updatedAt (UTC) | 目前 staleness | 是否在 3 天上限內 |
|---|---|---|---|---|---|---|---|
| TSLA | `0x4A1166a659A55625345e9515b32adECea5547C38` | 8 | 35904999999 | $359.05 | ~02:22:02 | 7,061s (~2.0h) | ✅ |
| AMZN | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | 8 | 25623810000 | $256.24 | ~22:54:37（前一天） | 19,506s (~5.4h) | ✅ |
| PLTR | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | 8 | 16929000000 | $169.29 | ~05:18:30 | 73s | ✅ |
| AMD | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | 8 | 45663145000 | $456.63 | ~16:40:08（前一天） | 45,575s (~12.7h) | ✅ |
| NVDA | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 8 | 22513500000 | $225.14 | ~05:19:30 | 13s | ✅ |

全部遠低於 `ChainlinkPriceFeed.sol` 寫死的 259,200 秒（3 天）staleness 上限，沒有 revert、沒有下市、位址沒有變動。Packed roundId（phaseId=1）都落在 ~700–2600 範圍，確認 feed 仍在持續更新，不是凍結狀態。

**Verdict：CONFIRMS 0901 NOTE UNCHANGED**

---

### A.5 — ChainlinkPriceFeed wrapper 位址（0901 筆記標記為「未記錄，需重新推導」的缺口）

**結論：已推導出來，並用三種獨立方式交叉驗證一致。**

調查中發現這件事其實已經被 `da13c80` 那次獨立驗證 pipeline 解過一次（`verification/settlement/raw_data/feed_config.json`，2026-09-03 12:14 由 `pull_data.py` 產生），本次調查獨立用另外兩種方式重新交叉驗證：

1. **`feed_config.json`**（pipeline 產出）：給出每個 symbol 的 wrapper 位址，以及該 wrapper immutable 指向的 `aggregator()`。
2. **`create_calls.json`**（解碼 29 筆真實 `createMarket` calldata）：每次真實建立市場時傳入的 `priceFeed` 參數，逐字元比對跟下表的 wrapper 位址完全一致。
3. **本次即時 `cast call`**：直接對 TSLA 和 NVDA 的 wrapper 位址呼叫 `aggregator()`，回傳值正好等於對應的 proxy 位址。

**最終 symbol → wrapper 位址對照表**（`StockPredictionMarket` `0x72DAb8B1B53b3CF028e9A0d1E21178981f264245` 每個市場的 `priceFeed` 參數用的是這些位址，不是原始 proxy/aggregator 位址）：

| Symbol | ChainlinkPriceFeed wrapper 位址 | wrapper.aggregator() → proxy | maxStaleness |
|---|---|---|---|
| TSLA | `0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f` | `0x4A1166a659A55625345e9515b32adECea5547C38`（即時驗證） | 259200 |
| AMZN | `0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953` | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | 259200 |
| PLTR | `0xBdC53E50b1167cE1199bFaD54A034f7ab1741051` | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | 259200 |
| AMD | `0x15636CE4C0EdE55335f84E6386f8F49C897c077d` | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | 259200 |
| NVDA | `0x914c40a644493b47336de847b0404E729e06C68d` | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15`（即時驗證） | 259200 |

順帶推導出每個 proxy 底下的原始 raw aggregator 及其 `description()`：

| Symbol | Raw aggregator | description() | phaseId |
|---|---|---|---|
| TSLA | `0x7A6b81ba7FbCB90104d8C496158Cf383cD7233b1` | "RHTSLA / USD" | 1 |
| AMZN | `0x93503dFc97157cdB8aADcCaf70452621d598FDeb` | "Robinhood AMZN / USD" | 1 |
| PLTR | `0x315afd0f71D5407B99ad19ab001a67af40fbAAF4` | "Robinhood PLTR / USD" | 1 |
| AMD | `0xdAD54b8Ee51Af258e5A6Faa9a84a3300f4775f7d` | "RHAMD / USD" | 1 |
| NVDA | `0xC9d16E4f2569b9E3ea0468fD85844953713DC2a2` | "RHNVDA / USD" | 1 |

（小觀察，非功能性問題：`description()` 命名不一致——TSLA/AMD 用 "RH" 前綴，AMZN/PLTR 拼全 "Robinhood"，NVDA 用 "RH"。純粹命名風格差異，不影響功能。）

**Verdict：UPDATES 0901 NOTE** — 0901 筆記標記這個位址「未落地在任何 log 檔案裡」，現已記錄如上，且與 `da13c80` pipeline 的獨立推導結果完全吻合。

---

## Part B — Genesis Round Decimals 異常：完整清單 + 與 27 筆真實交易比對

### B.1 完整異常 round 清單（不只 round #1）

對 5 個 RAW aggregator（非 phase-packed proxy）呼叫 `getRoundData(roundId)`，round 1–25 全數測試（無 revert），再用二分法找出確切轉換點。**異常不只限於 round #1**——每個 feed 都有一整段連續的早期 round 受影響，`answer` 數值量級都在 ~10^18（正常應為 ~10^10–10^11），差了約 10^8 倍，跟 0901 筆記發現的「round #1 除以 1e16 而非 1e8 才合理」一致，但範圍比原筆記猜測的大很多：

| Symbol | 最後一個異常 round | 第一個正常 round | 第一個正常 round 的 updatedAt (UTC) |
|---|---|---|---|
| TSLA | 37 | **38** | 2026-06-23 13:52:16 |
| AMZN | 26 | **27** | 2026-06-23 13:53:11 |
| PLTR | 50 | **51** | 2026-06-23 13:51:23 |
| AMD | 85 | **86** | 2026-06-23 13:57:40 |
| NVDA | 24 | **25** | ~2026-06-23 13:52:29 |

所有 5 個 feed 的 round #1 時間戳完全相同：**1782086431 = 2026-06-22 00:00:31 UTC**（共用的 genesis 種子時刻）。所有 5 個 feed 轉換成正常 decimals()=8 定價的時間點，全部落在一個 **~6 分鐘的窗口內**（2026-06-23 13:51–13:58 UTC）——讀起來像是**一次性、跨 5 個 aggregator 同時進行的批次重新配置事件**，而非 5 條 feed 各自獨立漸進調整；距離共用 genesis 時刻約 37.9 小時，距離鏈正式 mainnet 上線日（2026-07-01，見 0901 筆記）約還有 7.4 天。

對波動度/歷史資料計算的實務意涵（比 0901 筆記的建議更精確）：**排除規則不能是「排除 round #1」這種單一門檻，每個 feed 要用自己的 cutoff**（25 到 86 不等，視 symbol 而定，見上表）。

### B.2 與 27 筆真實 settleMarket 交易比對結果

讀取 `verification/settlement/test_cases.json`（27 筆真實 `settleMarket` 案例，含真實 on-chain `settleTimestamp`/區塊）。27 筆案例中最早的 `settleTimestamp`：**1783077475 = 2026-07-03 11:17:55 UTC**（market 0, TSLA，同時也是時間序上最早的一筆真實 settlement）。

對照 B.1：所有 5 個 feed 的異常 round 窗口最晚在 **2026-06-23 13:58 UTC**（AMD，5 個裡最慢轉正常的）就已結束。最早的真實 settlement 是 **2026-07-03 11:17:55 UTC**——比異常窗口結束時間晚了 **9.87 天（853,364 秒）**。

**確定性結論：不會。** 27 筆真實 `settleMarket` 交易（以及那 1 筆 `claimWinnings`）沒有任何一筆可能讀到任一 feed 的異常尺度 round——異常結束跟第一筆真實 settlement 之間有將近 10 天的緩衝，不是擦邊球式的結論。這把 `comparison_report.md` 的 Finding 1（原本結論是「尚未被觸發，這是程式碼層級的發現，非已觀察到的事故」）針對 genesis 異常這個具體角度，補上了一個確切的、量化過的答案：不只是「還沒觀察到」，而是**獨立確認過在真實歷史資料裡完全不可能碰到**。

方法論說明（與 0901 筆記、`comparison_report.md` 一致）：這次比對**不需要**歷史 archive `eth_call` 狀態（`comparison_report.md` 已確認這條 RPC 不支援，過去區塊會回傳 `"metadata is not found"`）。`getRoundData(roundId)` 在**當前**區塊查**過去**的 round，是 aggregator 合約當前 storage 的一般讀取，跟 archive node 支援與否無關——本次 session 共 125+ 次 round 查詢全部正常返回。

**Verdict：NEW FINDING** — 把 `comparison_report.md` Finding 1 從「尚未確認」推進成具體量化的「不會，有 9.87 天緩衝」，並額外發現異常範圍是一整段跨 feed 同步的 pre-launch 區塊（不只 round #1），且轉換時間點可以精確定位到分鐘級。

---

## Part C — AI Agent 資料源可用性調查（供 Arbitrum Open House Singapore 使用）

**明確聲明：以下內容純調查，不會整合進本 repo（ETH Online 的 `robinhood-stock-market`）。這是為另一場獨立的黑客松（Arbitrum Open House Singapore，2026-09-14 ~ 2026-10-04）預先準備的資料源盤點，未建立任何帳號/未申請任何金鑰，僅查詢公開文件/定價資訊。**

### C.1 Fear & Greed Index

兩個完全不同的指數，不能混為一談：

**加密貨幣版（alternative.me）**——大部分「Fear & Greed API」教學文章實際上指的都是這個。
- Base URL：`https://api.alternative.me/v2/`，指數本身用 `/fng/` endpoint。
- **不需要 API key/認證**，完全公開。
- 速率限制：10 分鐘滾動窗口內 **60 requests/分鐘**；底層資料本身每 5 分鐘才更新一次，查詢更快也沒意義。
- 回應格式 JSON，`limit` 參數控制回傳幾天歷史（`0` = 全部歷史），等於免費附贈歷史時間序列。
- 官方明講「免費政策永不改變，但隨時可能修改或終止 API」。
- 來源：[Alternative.me Crypto API docs](https://alternative.me/crypto/api/)

**股市版（CNN Business Fear & Greed Index）**——跟股票/證券類 agent 更相關的那個，也是要注意的落差點：
- **沒有官方、有版本控制的公開 API。** CNN 沒有提供 developer-facing endpoint 或 key。
- 實務上大家用的是 CNN 自家圖表頁（`https://www.cnn.com/markets/fear-and-greed`）背後的**內部**資料 API，不需要 key 就打得到，也有開源套件（例如 GitHub/PyPI 上的 `fear-greed-index`）直接打這個 endpoint 而非爬 HTML——但這是未公開版本控制的內部介面，CNN 隨時可能改格式或直接關掉，沒有事先通知的義務。當作「事實上可用但非正式支援的免費 API」看待，不是正式產品。
- 沒有官方速率限制（因為根本不是正式產品，無文件可查）——建議保守輪詢（例如每小時一次）避免觸發封鎖。
- 來源：[CNN Fear & Greed page](https://www.cnn.com/markets/fear-and-greed)、[DidierRLopes/fear-greed-index (GitHub)](https://github.com/DidierRLopes/fear-greed-index)

**建議**：對股票/證券導向的 agent 來說，CNN 版才是概念上正確的指數，但依賴一個未公開文件的內部 endpoint 對現場 demo 是真實的脆弱點——建議把 alternative.me 的加密貨幣版當作有文件、免 key 的備援/次要訊號，即使主要敘事是股票類，且不要讓程式在 CNN 內部 endpoint 改格式時直接 hard fail。

### C.2 FRED（Federal Reserve Economic Data）

- 申請流程：註冊免費 FRED/St. Louis Fed 帳號 → 申請 API key → **即時核准**，無等待期，**完全免費**、沒有付費層級。
- 速率限制：有 key 時 **120 requests/分鐘**（無 key 時約 30/分鐘）；部分文件提到 `/fred/series/observations` 這類 endpoint 有更緊的限制（約 40/分鐘）——重度使用建議照保守的 40/分鐘規劃。
- 確認過真實存在的 series ID（有查證，非猜測）：
  - `DFF` — 聯邦基金有效利率（日頻）
  - `DGS10` — 10 年期公債殖利率（日頻）
  - `CPIAUCSL` — CPI，所有城市消費者（月頻）
  - `UNRATE` — 失業率（月頻）
- 來源：[FRED API docs / errors reference](https://fred.stlouisfed.org/docs/api/fred/errors.html)、[EconIndx getting-started guide](https://econindx.com/guides/getting-started-fred/)

**建議**：四個資料源裡最好整合的一個——免費、即時發 key、額度寬鬆，上面 4 個 series 剛好涵蓋利率/通膨/就業/殖利率曲線，是交易 agent 用的標準總經指標組合。

### C.3 RSI/MACD（需要 OHLC 歷史資料，沒有直接的指標 API）

沒有任何權威性的「RSI API」——RSI/MACD 本質上是從 OHLC/K 線歷史資料在客戶端算出來的，真正的問題是要用哪個 OHLC 資料源。

**外部行情 API 免費層比較：**

| 供應商 | 免費層額度 | 備註 |
|---|---|---|
| Alpha Vantage | 約 25 requests/**天**（部分文件提到 burst cap 5/分鐘） | 對 demo 以外的用途太薄 |
| Twelve Data | 800 requests/**天** | 黑客松規模夠用 |
| Polygon.io | 5 requests/**分鐘**（理論上限約 7,200/天） | 三者裡免費層吞吐量最好，但按分鐘限制代表爆發式輪詢會被限流 |

來源：[Alpha Vantage pricing overview](https://apicostcalc.com/alpha-vantage.html)，Twelve Data / Polygon.io 免費層數字經多份 2026 API 比較文章交叉確認。

**自有替代方案**：本次調查（見 Part A/B 鏈上調查部分）已重新確認這個生態系背後的 Chainlink aggregator 支援對任意歷史 round 呼叫 `getRoundData(roundId)`——也就是說已經有一個免費、無額外速率限制的歷史價格資料源可用。

**建議**：只要該 symbol 有對應的 Chainlink feed，優先從 Chainlink round 歷史推算 RSI/MACD——零成本、無外部速率限制，且跟 settlement 邏輯本身信任的是同一份資料。只在沒有 Chainlink feed 的 symbol，或 round 密度不足以模擬短週期 RSI/MACD 窗口時，才動用外部 API（三者中 Twelve Data 的 800/天在成本/吞吐量上最划算）。

**[2026-09-05 更正]** 上一段原本寫「raw aggregator 全生命週期只有約 2 筆 log 事件」——這個數字是錯的，已用真實 `eth_getLogs` 全歷史查詢推翻：TSLA raw aggregator（`0x7A6b81ba7FbCB90104d8C496158Cf383cD7233b1`）實測 **1,120 筆 `AnswerUpdated` + 1,120 筆 `NewRound`**（另有其他 event type，全部 topic0 加總 3,380 筆 log），分佈在 block 112,693 到 54,470,486，幾乎橫跨整條鏈歷史——不是 2 筆。這個錯誤數字也跟本文件自己 Part A.4 記錄的「packed roundId 落在 ~700–2600 範圍」互相矛盾（那個範圍本來就暗示上千次更新）。原意可能是想講「2 種 event 類型」（`NewRound` + `AnswerUpdated`），但字面上寫成「2 筆事件」是誤植。其餘 4 個 feed 量級應該類似（未逐一重新實測，除非後續方向一設計需要精確數字才補測）。**結論修正**：Chainlink round 密度遠比原本評估的密集（整條鏈歷史里上千次更新），用 Chainlink round 歷史算短週期 RSI/MACD 的可行性比原文件保守估計的更高，不是「務必先確認密度」的猶豫態度，而是已有實測數據支持可行。

### C.4 X (Twitter) 情緒分析

- **免費層已經沒有了。** 自 **2026-02-06** 起，X 把新開發者的預設方案換成**用量計費**——新開發者已經沒有辦法申請舊的 Basic/Pro 方案。
- 用量計費定價：**每則貼文 $0.015**（含連結的貼文 $0.20）、**每次讀取 $0.005**，讀取上限 **每月 2,000,000 次**（超過需要 Enterprise 方案）。
- 舊制方案僅限既有訂閱者延續：Basic 約 $200/月、Pro 約 $5,000/月、Enterprise 起價約 $42,000/月。
- **對黑客松預算來說，重新申請直接整合不切實際。**
- 可行的第三方替代方案（整合 X 以外的社群來源，不需要直接跟 X 簽 API 合約）：
  - **LunarCrush** — 涵蓋 4,000+ 加密貨幣與 2,000+ 股票的社群情緒/創作者指標/市場訊號，單一 REST API，資料來源包含 X、Reddit、YouTube、TikTok。2026 年最常被引用的現成加密/股票社群情緒 API。
  - **Adanos** — 明確依來源分開（X/Grok、Reddit、新聞、Polymarket、加密貨幣）在同一套 schema 下，有公開商業定價（約 $29/$299 兩檔）。
  - **Santiment** — 社群 + 鏈上資料整合，通常搭配 LunarCrush 一起用，較少單獨用作純社群情緒來源。
  - 來源：[LunarCrush API](https://lunarcrush.com/products/lunarcrush-api)、[Adanos](https://adanos.org/)、[sentisense.ai 股票情緒供應商總覽](https://sentisense.ai/blog/best-stock-sentiment-data-providers-2026/)

**建議**：黑客松不要嘗試直接整合 X API——用量計費沒有免費層，單次成本雖小但不可預測。LunarCrush 是最直接可用的現成替代方案，本身就同時涵蓋加密貨幣與約 2,000 支股票，且資料來源本來就包含 X。

---

## Part D — 競品掃描

### D.1 Robinhood Chain 上的股票/證券預測市場競品

`gh search repos "robinhood chain" prediction` 與 `github.com/topics/robinhood-chain` 查出一個真實存在、有相當規模的競爭領域。跟本 repo（股票/證券 parimutuel 預測市場 + Chainlink，Robinhood Chain）重疊程度由高到低：

| Repo | 描述 | 最後 push | 重疊說明 |
|---|---|---|---|
| `presagemarkets/presage` | "Parimutuel prediction markets and 1v1 duels on tokenized stocks, on Robinhood Chain - self-settling via 30-min Uniswap v3 TWAP" | 2026-09-02 | **目前找到最接近的對手。** 同樣的 parimutuel 機制、同樣的代幣化股票資產類別、同一條鏈。差異在結算 oracle：用 Uniswap v3 TWAP，不是 Chainlink。 |
| `predgeAI/predge-robinhood` | "resolution/verification oracle for on-chain prediction markets & RWA perps. ERC-8004 validator + slashable bond, live on Robinhood Chain testnet." | 2026-08-17 | 不同層——他們做的是市場可以掛接的「oracle/resolution」原語本身，用 ERC-8004 agent-validator 模式，跟本 repo 規劃中的 AI agent 身分驗證（World AgentKit）方向相關但標準不同（ERC-8004 vs. World ID）。 |
| `barboss2000/blockoracle-evm` | EVM-based 去中心化預測市場，1–5 分鐘快速價格對戰 | 2026-03-17 | 同領域，週期更短，僅測試網，約 6 個月未更新（偏舊）。 |
| `vladtenev/Hoodmarket` | 去中心化預測市場協議，任何人可建立/交易 conviction market | 2026-07-09 | 泛用型 conviction market，非股票專屬。**注意**：repo 擁有者帳號名稱與 Robinhood 真實共同創辦人/CEO 同名（Vlad Tenev）——本次調查無法確認是否本人或僅為同名，未進一步查證。 |
| `alphamarketrh/alpha-market` | 結算以持有人自身資產計價，明講「no oracle and no liquidation」 | 2026-08-06 | 明確走**無 oracle**設計（純抵押品算術），架構方向跟本 repo 依賴 Chainlink feed 完全相反。 |
| `shelbybrothers/robincast` | "270 markets, parlays, and a 24h stream board" | 2026-08-06 | 範圍更廣（270 個市場，非股票專屬），parlay/直播角度。 |
| `ajanaku1/the-pit` | PvAI 預測市場：盲抽虛擬投資組合對戰自主 AI 基金經理 | 2026-07-21 | 機制不同（PvAI 組合對戰 vs. 二元漲跌），但同樣結合預測市場 + AI agent，跟本 repo 規劃方向一致。 |
| `shinothelegend/Molfi-The-Autonomous-Vault` | 自主 AI 驅動預測 + 收益優化協議，同時在 Arbitrum 與 Robinhood Chain 上 | 2026-07-29 | 多鏈（也在 Arbitrum——跟使用者另一場 Arbitrum Open House Singapore 黑客松有關），AI 驅動收益/預測混合型。 |

鄰近領域（非預測市場，但同樣是 Robinhood Chain 上的 AI agent 生態，若 AgentKit/x402 整合真的推進會相關）：
- `dmustapha/alpha-attest` — "AI financial signal marketplace with cryptographic accountability"（AI + Chainlink）
- `arigatoexpress/sapphire-sentinel` — 自主 RWA agent 的政策/隱私/支付安全
- `proof-of-agent/protocol` — AI agent 的 stake-and-slash 信任原語（在 Robinhood Chain 上）
- `0xMatdis/Robinhood-Chain-Bankr-Tools` — Robinhood Chain 上 AI agent 的工具箱
- `adrydevel/robinhood-chain-mcp`、`jp4g/robinhood-chain-skill` — agent 開發工具，非市場本身

~~**⚠️ 重要發現，非競品——使用者請自行確認：** `gh search repos` 同時查到 **`pplmaverick/robinhood-prediction-market`**（2026-09-03T05:08:36Z push，就是今天），擁有者跟本 repo 是**同一個 GitHub 帳號**（`pplmaverick`，user id 95532618，經 `gh api repos/pplmaverick/robinhood-prediction-market` 確認 `"fork": false`——GitHub 判定這不是本 repo 的 fork，是獨立的歷史紀錄/上傳，非分叉副本）。其描述——*"Parimutuel stock prediction market on Robinhood Chain Mainnet · Native Stock Tokens (TSLA/AMZN/PLTR/AMD/NVDA) · Live Chainlink Data Feeds · Deployed day 2 of mainnet launch"*——讀起來描述的是跟本 repo（`robinhood-stock-market`）同一個底層專案：同樣 5 支股票、同一條鏈、同一種 oracle。這件事純粹陳述事實，不評斷意圖或真偽——可能是無害的鏡像/備份，也可能是提交 Continuity Track 前需要先自行處理的重複項目，若評審同時找到兩個 repo 可能引發原創性/資格疑慮，建議使用者自行確認並在提交前處理。~~

**[已更正，09-03 晚間補充]** 上面這段結論是誤判，不是重複 repo。`pplmaverick/robinhood-prediction-market` 就是本 repo 自己的 GitHub 身分——本機資料夾名稱是 `robinhood-stock-market`，但這個資料夾的 git remote 一直都指向 GitHub 上的 `robinhood-prediction-market`（`git remote -v` 可直接確認）。已用兩個獨立事實交叉核實：(1) 該 repo 目前 main branch tip SHA 是 `591d4903...`，跟本機 `git log -1` 的 HEAD 逐字元相同；(2) 該 repo 的 `createdAt` 是 `2026-06-10T12:13:49Z`，跟本機第一個 commit（`d115061`，同一天）吻合。原本結論錯誤的原因：當時的調查沒有回頭比對本 repo 自己的 `git remote -v`，只憑 GitHub 上的 repo 名稱（`robinhood-prediction-market`）跟本機資料夾名稱（`robinhood-stock-market`）字面不同，就誤判成兩個獨立專案。完整交叉驗證過程見文件末尾「09-03 晚間補充：AgentKit PR 交叉驗證」一節。

### D.2 ETH Online 2026 Continuity Track 現況

- 確認這場黑客松是 **ETHGlobal 的 ETHOnline 2026**（`ethglobal.com/events/ethonline2026`）——`ethglobal.com/events/ethonline2026/prizes` 頁面是活的，確認真實存在 **Continuity Track** 結構，多個贊助商都有各自的 continuity 專屬獎金：
  - **The Graph**："Best AI Tooling or AI Use Case with The Graph (Continuity)" — $5,000，獎勵「用 The Graph 當作即時鏈上資料來源的 AI agent 或應用」——直接對應本 repo 規劃中的 x402/Graph 整合。
  - **Chainlink**："Best Chainlink-Powered Upgrade" — $500，僅限 continuity。
  - **World**：AgentKit 整合獎金 — $3,500 — 直接對應本 repo 規劃中的 AgentKit 工作。
  - **Hedera**：用 x402 支付軌道的「agentic economy」獎金（同樣用 x402 的平行案例，但在不同鏈上）。
  - Arc、Uniswap、1inch、ENS、Bazantic、Hedera 也都有 continuity track 獎金。
- **沒有找到任何預測市場專屬的賽道或贊助商獎金**——本 repo 不是在一個專屬「預測市場」類別下競爭，會被歸在通用的 Chainlink/Graph/World 獎金項目下評審。
- **ETHOnline 2026 獎金頁面完全沒有提到 Robinhood 或 Robinhood Chain**——沒有 Robinhood 贊助的賽道,代表用 Robinhood Chain 的其他競品提交案，不會被限定在某個 Robinhood 專屬賽道裡集中出現,只能靠瀏覽全部提交案才找得到。
- 無法確認 ETHOnline 2026 的公開提交作品畫廊（project gallery）目前是否已經上線——獎金頁面沒有連到畫廊頁,搜尋也沒找到直接的畫廊網址。距離提交截止日可能還太早,尚未開放,或是需要直接在 ethglobal.com 站內導覽才找得到,搜尋引擎索引不到。**未確認,誠實標記為待解,不猜測。**

### D.3 一般網路活動

- 多篇近期（2026-07 至 2026-09）財經媒體報導證實 Robinhood Chain 與 Robinhood 自家的預測市場,是當下真實發生的重大商業趨勢（Yahoo Finance/Bernstein：預測市場規模到 2028 年可能達 $1.7B；Decrypt："Robinhood Posts Best Quarter Ever as Prediction Market and Robinhood Chain Take Off"；Motley Fool：Robinhood 的預測市場營收已超過加密貨幣營收）——這是 Robinhood 自家的第一方產品線,跟上面列的第三方鏈上專案是分開的,但確立了「股票預測市場 × Robinhood Chain」這個交集現在確實有強烈的真實世界關注度。
- 網路搜尋找到 `bridgepred.com`（"BridgePred — Prediction Markets for Robinhood Chain"）——一個活著的行銷網站,但 WebFetch 只抓到一個標題,無法確認其實際範圍、技術棧、是否用 Chainlink/Graph/AI,或是否跟任何黑客松有關。**未完整查證,需要更深入的頁面抓取才能進一步判斷。**
- 沒有找到任何新聞/部落格/X 報導指出有「黑客松團隊」specifically 在做 Robinhood Chain 股票預測市場——第 D.1 節的 GitHub 層級競爭才是真正的訊號,媒體報導層級沒有。

**小結**："Robinhood Chain 上的股票預測市場" 這個競爭領域是真實且不小的——找到至少 8 個直接或高度相關的 GitHub repo,其中 `presagemarkets/presage`（parimutuel + 代幣化股票 + Robinhood Chain,昨天才 push）是架構上最接近的對手,但它用 Uniswap TWAP 而非 Chainlink 做結算。本 repo 鎖定的 The Graph 與 World AgentKit continuity 獎金都是真實、目前正在公開徵件的項目,且 ETHGlobal 官方沒有點名任何 Robinhood 專屬的競爭類別。目前最需要使用者自己處理的意外發現,是使用者自己帳號下的第二個 repo（`pplmaverick/robinhood-prediction-market`）讀起來描述的是同一個專案——這點獨立於任何競品動態,建議提交前先自行確認。

---

## 總結：9/4 當天仍需重新確認的項目清單（更新版，取代 0901 筆記結尾的清單）

1. ~~`@x402/fetch`/`@x402/evm` 版本~~ — **已於本次確認無變化**（仍是 2.24.0），9/4 建議快速重跑一次 `npm view` 確認沒有在最後一天跳版即可,不需要重新做完整調查。
2. ~~The Graph testnet gateway 是否可用~~ — **已解決**：正確 host 是 `gateway.testnet.thegraph.com`（不是 `testnet.gateway.thegraph.com`），已用真實請求打通並記錄格式。**新待辦**：檢查 `client-x402` 套件的 `chains.ts` 是否也把這個 host 順序寫反了——這次調查沒有深入套件原始碼確認,9/4 動工前建議先讀一次。
3. **`worldcoin/agentkit` PR #36/#39/#42 合併狀態** — 仍是風險最高項目,但比 0901 筆記假設的更明確：#39 已合併但只在 `new-cli` 側分支,`main`/npm（0.2.1）都還沒變,9/4 當下 SIWE 介面應該仍可正常使用；但因為這是「即將發生、綁定 CLI v0.2（PR #38，仍是 open）一起上線」的斷裂,9/4 開工前務必再查一次 `gh pr view 38 --repo worldcoin/agentkit` 和 `main` 分支現況,確認整包還沒被合併進來。`lookupHuman` 的 RPC-failure-vs-unregistered 問題上游仍未處理,poh-aggregator 的三態修正法仍是唯一已知解法。
4. ~~Robinhood Chain 5 個 Chainlink feed 是否仍存活~~ — **已重新確認,全部存活**,9/4 建議照慣例快速重跑一次 `latestRoundData()` 而非重做完整調查。
5. ~~`ChainlinkPriceFeed` wrapper 位址~~ — **已推導並記錄**（見 A.5 表格）,不需要再重新推導。
6. **（新）使用者自己帳號下的重複 repo** `pplmaverick/robinhood-prediction-market` — 需要使用者自行確認這是什麼、跟本 repo 的關係,並在 Continuity Track 提交前處理妥當。
7. **（新）ETH Online 2026 提交作品畫廊是否已上線** — 本次調查未能確認,若上線後建議重新掃一次是否有更直接的競品案例浮現。

---

## 09-03 晚間補充：AgentKit PR 交叉驗證

### 1. 結論成立，且這次驗證方法更紮實

原 0903 筆記對 PR #39 / #38 狀態的結論（#39 已合併但只在 `new-cli` 側分支、`main` 與已發布 npm 套件 0.2.1 尚未變動），經獨立重新驗證後**結論成立、未被推翻**。這次驗證比先前更紮實，原因：

- 直接讀 `baseRefName`/`headRefName` 欄位（`gh pr view --json baseRefName,headRefName`），不是從 PR 標題/描述文字推論。
- 用 branch comparison API（`gh api repos/worldcoin/agentkit/compare/main...new-cli`）確認 `new-cli` 領先 `main` 19 個 commit、落後 0 個——直接證明沒有透過其他路徑併入 main。
- 用 npm 發布日期排序做時序證明：`@worldcoin/agentkit`／`@worldcoin/agentkit-core` 皆為 2026-08-24 發布，早於 PR #39 合併時間（2026-09-01）超過一週；`@worldcoin/agentkit-cli` 更舊（0.2.0，約 2026-04-29）。三者發布時間都早於這兩個變更，是時序上的直接證明，不是假設。
- 實際讀 PR #39 的 diff 內容（`gh pr diff 39`），不只看標題/描述。

### 2. 再驗證過程中新發現的兩項技術細節

- **影響範圍比原本認為的更廣，不只 agentkit-cli**：PR #39 的 diff 同時改到 `x402/src/client.ts`、`x402/src/hooks.ts`、`x402/src/protocol.ts`、`x402/DOCS.md`，以及 `skills/*.md`（共 27 個檔案，+1256/-258 行）。RFC 9421 簽章格式變更貫穿整條 x402 請求簽章路徑，不是只影響 CLI 端的身分驗證。
- **簽章格式具體差異**：舊機制對 request body 做原始簽章，回傳單一 `signature` hex 值，放在 `AgentKit` header。新機制依 RFC 9421 對 `@method`／`@authority`／`@path`／`@query`／`content-digest` 簽章，回傳三個 header（`Content-Digest`、`Signature-Input`、`Signature`），5 分鐘過期時限，並綁定 keyid。實際驗證函式是 `core/src/verify.ts` 裡的 `verifyRequest`（不是 0901 筆記加註「或等效函式」猜測的 `verifyAgentkitSignature`——該函式名稱實際上不存在，`verifyRequest` 才是正確名稱），另外新增了 `core/src/signature.ts`（224 行新增）。

### 3. 待辦標記（給未來任何 session）

⚠️ PR #38（base: `main`，head: `new-cli`，目前狀態 OPEN）是真正會把這個 breaking change 併入 `main`、進而進到下一次 npm 發布的 PR。截至本次檢查，`new-cli` 領先 `main` 19 個 commit、落後 0 個——沒有透過任何其他路徑併入。**如果未來任何 session 要針對簽章驗證邏輯開發，且假設對方用的是舊格式，開工前務必重新查一次 PR #38 的合併狀態——不要直接沿用本筆記這個時間點的快照。**

### 4. 流程備註（非技術發現）

原本用來檢查 npm 版本的指令 `npm view agentkit version` 本身是錯的——`agentkit`（無 scope）解析到一個完全無關、已被其他人棄置的套件（`agentkit@0.0.0`，維護者是 `tejaskumar`，跟 Worldcoin 無關）。正確指令是 `npm view @worldcoin/agentkit version`。記錄下來，避免未來的 session 重蹈覆轍。

### 5. Part D.1「重複 repo」發現更正

Part D.1 的「重複 repo」結論已證實是誤判，原文已在原處以刪除線標記並附上更正說明（見上方 Part D.1）。上方「9/4 待重新確認清單」第 6 項（使用者自己帳號下的重複 repo）也已隨之解決，不再是待辦事項——`pplmaverick/robinhood-prediction-market` 就是本 repo 自己，沒有需要在提交前額外處理的重複項目。

