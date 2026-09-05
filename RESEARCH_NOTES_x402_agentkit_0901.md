# 調查報告：x402 / EOAValidator / Chainlink Feed / World AgentKit

調查日期：2026-09-01（唯讀調查，未寫入任何 .ts/.sol/.js、未跑測試、未安裝套件）
用途：9/4 開賽當天實作前的技術基線筆記

---

## 調查一：The Graph x402 介面規格

### 1-1 套件位置與版本

- **不是**獨立 repo，是 `graphprotocol/graph-client` monorepo 底下的 workspace 套件：`packages/x402/`
- npm 套件名稱：`@graphprotocol/client-x402`
- **目前版本：1.0.0**（唯一發布版本，首次且至今唯一一次 publish：2026-04-14T12:47:49Z）
- Git 歷史：只有 2 次 commit 動過這個路徑
  - `b5bad7b` 2026-04-14 "feat: add x402 client for agents (#1016)"（首次加入）
  - `b0ad634` 2026-05-08 "docs: fix x402 client readme (#1023)"（文件修正）
- **自 2026-05-08 起完全沒有再更新過**（距今近 4 個月無 commit）
- 來源：https://github.com/graphprotocol/graph-client/tree/main/packages/x402

### 1-2 套件本身不含 402 協議實作，只是薄包裝

讀完 `packages/x402/src/*.ts`（index.ts、createGraphQuery.ts、chains.ts、bin.ts）後確認：`@graphprotocol/client-x402` 本身**沒有實作**402 response 解析或 EIP-712 簽名邏輯，全部委派給：
```json
"dependencies": {
  "@x402/fetch": "^2.8.0",
  "@x402/evm": "^2.8.0",
  "viem": "^2.39.3"
}
```
它做的事只有：用 `viem` 的 `privateKeyToAccount` 建 signer → `registerExactEvmScheme(client, {signer})` → `wrapFetchWithPayment(fetch, client)` → 包出一個會自動處理 402 重試的 `fetch`。三種用法（CLI `graphclient-x402`、`createGraphQuery()` programmatic、`.graphclientrc.yml` 的 `customFetch`），配置全靠環境變數 `X402_PRIVATE_KEY` / `X402_CHAIN`（`base` 或 `base-sepolia`，只有這兩個合法值，寫死在 `chains.ts` 的 `CHAIN_IDS`）。

**⚠️ 版本落差風險（9/4 需重新確認）**：`client-x402` 的 `package.json` 鎖定 `@x402/fetch`/`@x402/evm` 為 `^2.8.0`，但這兩個套件在 npm 上**目前最新版是 2.24.0**（2026-08-27 才發布，距今 5 天），`^2.8.0` semver range 會直接解析到 2.24.0。x402-foundation/x402 repo 本身極活躍（6561 stars，最後一次 push 是 2026-08-31，昨天）。16 個 minor 版本的落差代表：
1. `client-x402` 從沒針對 2.9~2.24 之間的任何 breaking change 重新測試過（它本身 4 個月沒更新）
2. 9/4 當天 `npm install` 抓到的實際 `@x402/evm` 行為，跟這份調查讀到的 typescript 原始碼**不保證完全一致**——必須當天重新讀一次實際安裝到的版本

### 1-3 402 Response 完整 JSON 格式（已用真實請求驗證，非只讀文件）

用 `curl` 對 The Graph **正式 production gateway** 打了一個真實請求（未附款），拿到活的 402 回應（2026-09-01 02:50 UTC）：

```
POST https://gateway.thegraph.com/api/x402/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV
→ HTTP/2 402，Content-Length: 0，所有資訊都在 `payment-required` header（base64）
```
解碼後：
```json
{
  "x402Version": 2,
  "error": "Payment-Signature header is required",
  "resource": {
    "url": "http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "10000",
      "payTo": "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
      "maxTimeoutSeconds": 300,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "extra": {
        "assetTransferMethod": "eip3009",
        "name": "USD Coin",
        "version": "2"
      }
    }
  ]
}
```

**欄位對照**：
| 欄位 | 值 | 說明 |
|---|---|---|
| `x402Version` | `2` | 協議版本 2（header-based transport，見下） |
| `accepts[].amount` | `"10000"` | 價格，USDC 6 decimals = **$0.01/query**，與官方公告一致 |
| `accepts[].asset` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base 主網真實 USDC 合約地址 |
| `accepts[].network` | `eip155:8453` | CAIP-2 格式，8453 = Base mainnet |
| `accepts[].payTo` | `0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB` | The Graph gateway 收款地址 |
| `accepts[].extra.assetTransferMethod` | `eip3009` | 用 USDC 原生 `transferWithAuthorization`，不用 Permit2 |
| `accepts[].maxTimeoutSeconds` | `300` | 簽名有效視窗 5 分鐘 |

**重要**：這是 x402 **協議 v2**（header-based：`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` 三個 HTTP header，body 不帶協議資訊），**不是**網路上常見教學文章講的 v1（body 直接回 402 JSON、`X-PAYMENT` header）。實測回應 `Content-Length: 0`，所有 402 資訊確實都在 `payment-required` header 裡，跟 x402-foundation/x402 repo 的 `specs/transports-v2/http.md` 完全吻合。

來源：
- https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md
- 實測：`gateway.thegraph.com`（本次調查直接請求，即時證據）

### 1-4 EIP-712 簽名欄位（domain / types / message）

因為 `accepts[].extra.assetTransferMethod = "eip3009"`（預設值），簽的是標準 EIP-3009 `TransferWithAuthorization`。原始碼在 `x402-foundation/x402` repo：`typescript/packages/mechanisms/evm/src/exact/client/eip3009.ts` + `constants.ts`：

```typescript
// domain
{
  name: requirements.extra.name,        // 本例 = "USD Coin"
  version: requirements.extra.version,  // 本例 = "2"
  chainId: getEvmChainId(requirements.network),  // 8453
  verifyingContract: requirements.asset  // USDC 合約地址
}

// types
{
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ]
}

// message
{
  from: signer.address,
  to: paymentRequirements.payTo,
  value: paymentRequirements.amount,      // "10000"
  validAfter: "0",
  validBefore: now + maxTimeoutSeconds,   // now + 300
  nonce: <16-byte random, client 產生>
}
```
`primaryType: "TransferWithAuthorization"`。這是標準 USDC EIP-3009 格式，跟 Coinbase/Circle 官方文件一致，沒有 Graph 自訂欄位。

來源：https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/src/exact/client/eip3009.ts 、 `constants.ts`（同目錄）

### 1-5 Gateway `/api/x402/` endpoint 設定

| 環境 | Endpoint | 支付網路 |
|---|---|---|
| production | `https://gateway.thegraph.com/api/x402/subgraphs/id/<SUBGRAPH_ID>` | Base (`eip155:8453`) |
| testnet | `https://testnet.gateway.thegraph.com/api/x402/subgraphs/id/<SUBGRAPH_ID>` | Base Sepolia (`eip155:84532`) |

必要環境變數：`X402_PRIVATE_KEY`（簽款私鑰）、`X402_CHAIN`（`base` 或 `base-sepolia`，預設 `base`）。不需要任何 API key／帳號註冊——402 本身就是認證機制。

**注意**：`testnet.gateway.thegraph.com` 這條路徑本次調查**沒有實際打通**（用猜測的 subgraph ID 沒有回應，未進一步排查是 subgraph 不存在還是 testnet gateway 本身有問題）——9/4 若要用 testnet 開發，建議當天先用一個確定存在的 testnet subgraph ID 重新驗證一次。Production gateway 已用真實請求確認可用。

來源：`packages/x402/README.md`（同上 repo 路徑）、官方文件 https://thegraph.com/docs/en/subgraphs/querying/graph-client/README/（該頁只列出功能表格打勾 + 連到 GitHub example，**沒有**任何 endpoint／環境變數／定價的技術細節——技術細節只存在於原始碼和 README，官方文件是概覽層級）

**⚠️ 9/4 需重新確認**：
1. `@x402/fetch`/`@x402/evm` 的實際安裝版本（2.24.0 或更新）跟這裡讀到的原始碼是否仍一致
2. testnet gateway 是否真的可用（本次未打通）
3. The Graph 官方部落格（thegraph.com/blog/understanding-x402-erc8004）寫的是「Full x402 Subgraph Gateway compatibility is in development」——這篇文章**明顯是舊的**，因為 production gateway 現在已經是活的，代表官方部落格內容可能落後於實際部署狀態，不能只看部落格判斷功能是否上線

---

## 調查二：Relayer Attestation 格式 vs 既有 EOAValidator 規格比對

### 2-1 EOAValidator 現有驗證邏輯（原始碼路徑：`/Users/pplmaverick/spacefi-contracts/node_modules/@gluwa/usc-contracts/contracts/write-ability/EOAValidator.sol`，來自 npm 套件 `@gluwa/usc-contracts`）

**簽名標準：既不是 personal_sign，也不是 EIP-712**——是**原始 hash 直接簽**（raw ECDSA，無 EIP-191 前綴）。程式碼註解明講：
> "Votes are `abi.encode(bytes[] signatures)`, each a 65-byte `(r, s, v)` ECDSA signature over the raw `messageHash` (no EIP-191 / personal_sign prefix) — byte-identical to what the Rust attestor produces"

`_recoverChecked()` 直接 `ecrecover(hash, v, r, s)`，`hash` 就是呼叫端傳進來的 `messageHash`，中間**沒有**任何 `keccak256("\x19Ethereum Signed Message:\n32" + hash)` 包裝。

**驗證邏輯本體 `validateVotes(bytes32 messageHash, bytes calldata votes)`**：
1. `abi.decode(votes, (bytes[]))` 拆出多個簽名
2. 對每個簽名 `ecrecover` 出 signer，檢查 `isAttestor[signer]`，且同一簽名者不能重複算（`DoubleSigning` revert）
3. 檢查 `unique >= calculateRequiredVotes(attestors.length)`（M-of-N threshold，公式 `floor(N*num/den)+add`，並有 `minAttestorCount` 下限）
4. **EIP-2 惡意簽名防護**：拒絕高-s 值（malleable signature）、拒絕 v ∉ {27,28}

**EOAValidator 本身完全不含**：nonce、timestamp、agent address、humanId 這些概念——它是**內容無關**（content-agnostic）的簽名門檻驗證器，只回答「這個 opaque 32-byte hash 有沒有被夠多已知 attestor 簽過」。

**實際消費端：`SimpleInbox.sol`**（同套件，`write-ability/SimpleInbox.sol`，程式碼標註 "Simple inbox for **PoC**"）才是真正組出 `messageHash` 並呼叫 `validateVotes` 的地方：
```solidity
function computeMessageHash(bytes32 messageId, address emitterAddress, bytes calldata payload)
    public view returns (bytes32)
{
    return keccak256(abi.encode(messageId, emitterAddress, localChainKey, creditcoinChainId, payload));
}

function deliverMessage(bytes32 messageId, address emitterAddress, bytes calldata payload, bytes calldata votes) external {
    require(!validatedMessages[messageId], "Already validated");   // <-- 唯一的防重放機制
    bytes32 messageHash = computeMessageHash(messageId, emitterAddress, payload);
    voteValidator.validateVotes(messageHash, votes);
    validatedMessages[messageId] = true;
    ...
}
```
**關鍵發現**：防重放（`validatedMessages[messageId]`）是在 **SimpleInbox**（消費端合約）做的，不是 EOAValidator。而且 `messageId` 是**呼叫端自訂的 bytes32**（不是遞增 nonce，也不檢查任何 timestamp/過期），這個 PoC 標註的合約完全沒有 staleness/expiry 概念。`payload` 欄位本身還規定死了格式：`abi.decode(payload, (address destinationContract, bytes payloadData))`——payload 內層才是真正給業務邏輯用的自由格式資料。

### 2-2 Robinhood 版 attestation 草案格式（本次設計，供 9/4 實作參考）

```
Attestation {
  agentAddress:  address   // AI Agent 的錢包地址
  humanId:       bytes32   // World AgentKit lookupHuman() 查到的 nullifierHash（uint256 轉 bytes32/hex）
  nonce:         uint256   // 防重放
  timestamp:     uint256   // 簽發時間，防過期
  signature:     bytes     // relayer 對上述欄位 hash 的簽名
}
```

### 2-3 逐欄位相容性對照表

| 草案欄位 | EOAValidator 能不能直接吃 | 說明 |
|---|---|---|
| **agentAddress** | ✅ 可以，但 EOAValidator 不認識這個欄位 | EOAValidator 只看 opaque `messageHash`；`agentAddress` 必須是呼叫端（類似 SimpleInbox 的 `computeMessageHash`）在組 hash 時 `abi.encode` 進去的其中一個欄位，EOAValidator 完全不解析內容 |
| **humanId (nullifierHash)** | ✅ 同上，內容無關 | 同樣要在呼叫端的 hash 組成公式裡包含這個欄位；EOAValidator 不會單獨驗證它 |
| **nonce（防重放）** | ⚠️ **介面要改**——EOAValidator 完全沒有 nonce/replay 狀態 | 兩層落差：(1) EOAValidator 本身零狀態，不可能加；(2) 就算比照 SimpleInbox 模式加一個消費端合約，SimpleInbox 現有的 `validatedMessages[messageId]` 只是「這個 ID 用過沒」的 boolean set，**不是**遞增/嚴格遞增 nonce，也不檢查「nonce 必須等於上一個+1」——如果需要嚴格遞增 nonce 語意，要另外寫新的消費端合約（或至少加一個 `mapping(address => uint256) nextNonce` 並在收到訊息時 `require(nonce == nextNonce[agent]++)`），這點 SimpleInbox 沒有現成的（`EOAValidator.sol` 裡另一個函式 `submitAttestorSetUpdate` 倒是有嚴格遞增 nonce 的範例可以抄，但那是用來換 attestor 名單的，不是給一般訊息用的） |
| **timestamp（防過期）** | ❌ **完全沒有，要新增** | EOAValidator 和 SimpleInbox 都**沒有任何** `block.timestamp` 比對邏輯。這塊要在新的消費端合約自己加：把 `timestamp` 編進 hash，收到後 `require(block.timestamp <= timestamp + maxAge)` |
| **relayer 簽名** | ✅ 可以直接吃，但簽名方式要對齊 | 3 個前提缺一不可：(1) relayer 必須用**原始 hash 直接簽**（沒有 EIP-191/personal_sign 前綴，也不是 EIP-712）——如果用 ethers/viem 的 `signMessage()`（personal_sign）或 `signTypedData()`（EIP-712）簽，`ecrecover` 出來的地址會是錯的，驗證一定失敗；必須用底層 `secp256k1.sign(hash, privateKey)` 這種原始簽名方式（2)relayer 地址必須先透過 `addAttestor()`/`updateAttestorSet()` 註冊成 `isAttestor[relayer]=true`；(3) 簽名要包成 `abi.encode(bytes[])` 陣列（即使只有一個 relayer 也要包成長度 1 的陣列），且需符合 EIP-2 low-s + v∈{27,28} |
| **threshold 機制** | ⚠️ 需要決定配置 | 如果只想要「1 個 relayer 簽名就算數」，把 `minAttestorCount=1`、attestor 名單只放這 1 個 relayer 地址即可相容；如果要多 relayer 門檻簽章（更去中心化），現有 `calculateRequiredVotes` 公式已經支援，不用改介面 |

### 2-4 結論

**EOAValidator 本身不用改**——它是刻意設計成內容無關的簽名驗證器，草案裡的 4 個業務欄位（agentAddress/humanId/nonce/timestamp）全部可以塞進呼叫端自訂的 `messageHash` 公式裡，EOAValidator 不會有意見。**真正要新寫的是消費端合約**（比照 `SimpleInbox.sol` 但要加兩塊 PoC 沒有的邏輯）：
1. nonce 嚴格遞增檢查（SimpleInbox 現有的只是防止同一個 ID 用兩次，不是遞增 nonce）
2. timestamp 過期檢查（SimpleInbox 完全沒有）

relayer 簽名端最容易踩雷的地方是**簽名方式**：一定要 raw hash 簽（不是 wallet 常見的 personal_sign / EIP-712），這通常代表 relayer 要用後端服務＋原始私鑰簽名（例如 Rust/Node 直接呼叫 secp256k1 函式庫簽 32-byte hash），不能直接套用一般前端錢包簽名流程。

來源：
- `/Users/pplmaverick/spacefi-contracts/node_modules/@gluwa/usc-contracts/contracts/write-ability/EOAValidator.sol`
- `/Users/pplmaverick/spacefi-contracts/node_modules/@gluwa/usc-contracts/contracts/write-ability/SimpleInbox.sol`
- （package 名稱 `@gluwa/usc-contracts`，同套件也存在於 `/Users/pplmaverick/spacefi/contracts/node_modules/`、`/Users/pplmaverick/spacefi-reverse-test/node_modules/` 兩份 mirror，內容一致）

---

## 調查三：Chainlink Feed 現況盤點

### 3-1 五個 feed 存活確認（2026-09-01 02:5x UTC，Robinhood Chain 主網 chainId 4663，RPC `https://rpc.mainnet.chain.robinhood.com`，最新區塊 51,373,914）

地址來源：`/Users/pplmaverick/robinhood-stock-market/scripts/deploy.js` 的 `CHAINLINK_FEEDS` 常數（程式碼註解：「Verified on-chain via description()/aggregator()/latestRoundData() eth_calls, not taken from documentation alone」——代表這份地址清單本來就是先前手動驗證過的）。本次用 `cast call`（Foundry，唯讀 eth_call，未部署/未簽署任何交易）逐一重新呼叫確認：

| Symbol | Feed 地址 | decimals | latest answer | updatedAt (UTC) | 狀態 |
|---|---|---|---|---|---|
| TSLA | `0x4A1166a659A55625345e9515b32adECea5547C38` | 8 | 36697500000 → **$366.975** | 2026-08-31 17:16:33 | ✅ 存活 |
| AMZN | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | 8 | 26050000000 → **$260.50** | 2026-08-31 19:50:34 | ✅ 存活 |
| PLTR | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | 8 | 18616490000 → **$186.1649** | 2026-08-31 19:55:40 | ✅ 存活 |
| AMD | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | 8 | 46848500000 → **$468.485** | 2026-09-01 00:01:14 | ✅ 存活 |
| NVDA | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 8 | 21991500000 → **$219.915** | 2026-09-01 00:16:15 | ✅ 存活 |

五個全部正常回傳，更新時間離查詢當下（2026-09-01 02:47 UTC）最遠 9.5 小時、最近 2.5 小時，遠低於 `ChainlinkPriceFeed.sol`（`/Users/pplmaverick/robinhood-stock-market/contracts/ChainlinkPriceFeed.sol`）寫死的 3 天 staleness 上限。

**架構細節（順藤摸瓜查到，非本次調查重點但值得記錄）**：這 5 個地址本身就是標準 Chainlink `EACAggregatorProxy`（有 `aggregator()` getter），底層 raw aggregator（例如 TSLA 對應 `0x7A6b81ba7FbCB90104d8C496158Cf383cD7233b1`）的 `description()` 回傳 `"RHTSLA / USD"`——代表 Robinhood 內部用 `RH` 前綴代表其代幣化股票報價，不是直接接原始 TSLA 報價源的裸 proxy。`StockPredictionMarket.sol`（同 repo）實際使用的是另一層 `ChainlinkPriceFeed.sol` wrapper（部署時包這 5 個地址，加上 3 天 staleness 檢查），wrapper 本身位址是 deploy 當下才產生、未落地在任何 log 檔案裡，如果 9/4 要接现有市場，記得是呼叫 wrapper 位址而非這 5 個原始 proxy 位址。

### 3-2 歷史波動度資料夠不夠用？

**結論：夠用，但有 1 個資料品質陷阱要注意。**

驗證方式：直接對 PROXY 和其底層 RAW aggregator 呼叫 `getRoundData(uint80 roundId)`：
- 在 PROXY（`0x4A1166...`）用 phase-packed roundId（`phaseId=1`，來自呼叫 `phaseId()` 確認）能正常查到任意歷史 round（測試 round #1000 成功回傳 2026-08-27 的價格）
- 在 RAW aggregator 用 plain roundId（不含 phase 位元）一樣查得到，round #1 存在，時間戳為 **2026-06-22**——這比 Robinhood Chain 主網正式上線日（2026-07-01，見 `[[project_robinhood_chain_lending]]` 既有筆記）還早 9 天，代表這條 feed 在鏈正式上線前就已經在跑（內部測試/預熱期資料）

**陷阱**：round #1 的原始 answer 數值換算成價格時，用 `decimals()=8` 除出來是天文數字（$396 億），但除以 `1e16` 卻得到 **$396.41**——一個看起來合理的 TSLA 股價量級。這代表**創世期（round 1 附近）的 round 資料可能跟現在的 decimals 語意不一致**，直接拿最早期的歷史 round 去算波動度會混入錯誤量級的資料點。實作波動度計算時建議：
1. 排除鏈正式上線（2026-07-01）之前的 round（即排除很低 roundId 的資料）
2. 或每筆歷史資料都重新用該 round 當下的實際 scale 做 sanity check（而非全部假設 decimals()=8 恆定）

除此之外，`getRoundData` 本身可正常回溯任意歷史 round，`updatedAt`/`answeredInRound` 欄位齊全，足以支撐波動度或其他時間序列衍生指標計算，**不需要額外資料源**。唯一要注意：`ChainlinkPriceFeed.sol`（`StockPredictionMarket` 實際用的 wrapper）本身**沒有 proxy `getRoundData()`**，只 proxy 了 `latestRoundData()`/`decimals()`——若 AI Agent 決策層要拿歷史資料，要繞過 wrapper 直接呼叫 `wrapper.aggregator()` 拿到底層 proxy 地址，再對那個地址呼叫 `getRoundData()`（本次已實測這條路徑可行）。

來源：本次即時 `cast call` 結果（Robinhood Chain mainnet，2026-09-01）；地址清單見 `/Users/pplmaverick/robinhood-stock-market/scripts/deploy.js`

**⚠️ 9/4 需重新確認**：這是活的價格 feed，數值本身每天都在變不用重查，但建議 9/4 當天至少重跑一次 `latestRoundData()` 確認 5 個 feed 仍未被 Robinhood/Chainlink 方棄用或更換地址（股票類 feed 若發生代幣重組/下市風險較高於一般加密貨幣 feed）。

---

## 調查四：World AgentKit 官方 SDK 能力清單

### 4-1 Repo 現況

`worldcoin/agentkit`，description "Bridging humans and agents online."，非常活躍：`pushed_at: 2026-08-27`（4 天前），近期 issue/PR 更新到 **2026-09-01（今天）**。monorepo 結構：`core/`（純邏輯，發布為 `@worldcoin/agentkit-core`）、`x402/`（server-side hooks，發布為對應 x402 套件）、`cli/`、`client/`（Rust client）、`contracts/`（Solidity，`AgentBook.sol`）、`skills/`。

`@worldcoin/agentkit-core` 目前版本 **0.2.1**，npm 上發布於 2026-08-24（跟 repo 上的 `core/package.json` 一致，無發布延遲）。版本歷史有個要注意的斷層：0.2.0（2026-04-29）到 0.2.1（2026-08-24）中間隔了將近 4 個月沒發版，但 2026-08 下旬起 issue/PR 活動突然變得非常密集（見下），像是為了某個時間點（很可能就是本次 9/4 這類活動）在衝刺開發。

### 4-2 `core/src/` 完整檔案清單與 exported API

檔案：`agent-book.ts`、`evm.ts`、`index.ts`、`parse.ts`、`schema.ts`、`solana.ts`、`types.ts`、`validate.ts`、`verify.ts`、`viem-client.ts`（皆已逐檔讀取原始碼，非僅列檔名）。`index.ts` 匯出清單：

```typescript
// 常數
AGENTKIT, AgentkitPayloadSchema, SOLANA_MAINNET, SOLANA_DEVNET, SOLANA_TESTNET

// 型別
AgentkitExtension, AgentkitExtensionInfo, AgentkitExtensionSchema, AgentkitPayload,
CompleteAgentkitInfo, SignatureScheme, SignatureType, AgentkitValidationResult,
AgentkitValidationOptions, AgentkitVerifyResult, SupportedChain

// 驗證
parseAgentkitHeader, validateAgentkitMessage,
resolveAgentkitSignatureRpcUrl, verifyAgentkitSignature,   // <-- 現成簽名驗證 helper
buildAgentkitSchema

// EVM 工具
formatSIWEMessage, verifyEVMSignature, extractEVMChainId, getDefaultPublicRpcUrl

// Solana 工具
formatSIWSMessage, verifySolanaSignature, decodeBase58, encodeBase58, extractSolanaChainReference

// AgentBook
createAgentBookVerifier, AgentBookVerifier, AgentBookOptions
```

**Q1：有沒有現成簽名驗證 helper？→ 有，`verifyAgentkitSignature(payload, options)`。**
- 依 `payload.chainId` 前綴分派：`eip155:*` 走 EVM（重建 SIWE 訊息字串 → `viem` 的 `publicClient.verifyMessage()`，同時涵蓋 EOA ecrecover 和 ERC-1271 智能合約錢包，不用自己刻）；`solana:*` 走 Solana（`@noble/curves` ed25519 驗證，輸入需 base58）
- `resolveAgentkitSignatureRpcUrl` 允許依 CAIP-2 chainId 傳自訂 RPC（`rpcUrls: {'eip155:4663': 'https://...'}` 這種寫法），代表**驗簽這一步不限於官方支援的鏈**——EVM 驗簽本質上只需要一個 RPC endpoint 就能對任意 EVM 鏈work，Robinhood Chain（`eip155:4663`）可以直接傳自訂 rpcUrl 使用，不需要等官方"支援"
- `viem-client.ts` 內建的「預設 RPC」清單（`defaultPublicRpcUrls`）只硬編了 `worldchain`、`base`、`tempo`（！用一把寫死在原始碼裡、註解宣稱"not a secret"的共用 Alchemy 免費 key）、`arcTestnet`、以及**尚未上線的 Arc mainnet**（chainId 5042，RPC 先佔位）——**沒有 Robinhood Chain**。這不構成阻礙（上一點已說明可以自己傳 rpcUrl），但代表用官方預設值那條路徑不會自動涵蓋 Robinhood Chain，必須顯式傳 `rpcUrl`/`rpcUrls`

**Q2：有沒有現成 nonce 管理邏輯？→ 有一個陽春版，且官方正在大改，9/4 前必須重新確認。**
- 目前 `main` 分支（0.2.1，即 npm 上能裝到的版本）的 `validate.ts::validateAgentkitMessage()` 只提供一個 **caller 自己傳入的 callback**：`options.checkNonce?: (nonce) => boolean | Promise<boolean>`——AgentKit 本身**不持久化、不產生 nonce**，純粹是個掛勾，nonce 儲存/查重要自己刻
- 同套件內 `x402/src/storage.ts` 有一個參考實作 `InMemoryAgentKitStorage`（`hasUsedNonce`/`recordNonce` 各自獨立呼叫，**非原子操作**）
- **⚠️ 這套機制正在被取代，且新版尚未合併**：
  - PR #36「fix: consume replay nonces atomically」——**OPEN**，尚未合併，要把 `hasUsedNonce`/`recordNonce` 換成單一原子 `tryRecordNonce(nonce, expiresAt)`，修掉現有版本的 TOCTOU race condition（兩個並發請求可能都通過重放檢查）
  - PR #39「Sign requests with RFC 9421 HTTP Message Signatures」——**OPEN**，尚未合併，打算把整個簽名格式從現在的 SIWE-based `AGENTKIT` header 換成 RFC 9421 HTTP Message Signatures
  - PR #42「feat: make signatures single-use with a nonce」——**CLOSED，未合併**（stacked on #39，#39 沒合併它也進不去），內容是替 RFC 9421 方案加 16-byte 隨機 nonce + `tryRecordNonce` 原子檢查
  - 也就是說：**現在能读到、能装到的原始碼（本報告記錄的）是「現行版」，但官方内部已經在準備一次簽名格式 + nonce 語意的大改**，這批 PR 全部發生在 2026-08-24～09-01 這一週內（跟 npm 0.2.1 剛好同期），非常可能在 9/4 前後就會合併掉。**這是本次調查中風險最高的一項，9/4 當天必須重新讀一次 `main` 分支確認上述 PR 有沒有合併，簽名格式和 nonce 介面極可能已經變了。**

**Q3（額外發現，任務未直接問但直接可用）：`AgentBook.lookupHuman` 的鏈上定義**——`contracts/src/AgentBook.sol`（Solidity）：`mapping(address => uint256) public lookupHuman`，事件註解明寫 `humanId`＝「anonymous human identifier (nullifier hash)」，跟調查二草案裡「humanId(nullifierHash)」的認知完全一致，`register()` 함수本身走標準 World ID `IWorldIDGroups.verifyProof` + `ByteHasher`，`AgentBook` 合約**只部署在 World Chain**（`createAgentBookVerifier` 固定打 `worldchain.id`，即 CAIP-2 `eip155:480`，合約地址 `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`），無論 agent 簽名是哪條鏈產生的都一樣查這個地址——這代表 Robinhood Chain 上的 AI Agent 要查 humanId，一定是跨鏈讀 World Chain 的這個合約（用上面 `getDefaultPublicRpcUrl`/自訂 rpcUrl 機制），不會有「Robinhood 版 AgentBook」這種東西。

**Q4（延伸追問已核實）：`verifyAgentkitSignature` 是不是「查 AgentBook + 驗簽名」二合一？→ 不是，兩個完全獨立的函式。**
- 逐行讀完 `core/src/verify.ts`（137 行）確認：`verifyAgentkitSignature` 只做簽名驗證（SIWE 重建 + `viem` 的 `client.verifyMessage()`，內部走 EOA ecrecover / ERC-1271 / ERC-6492），**完全沒有**引用 `AgentBook`、`lookupHuman`，或合約地址 `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` 任何一處。
- `lookupHuman` 是另一個獨立函式 `createAgentBookVerifier().lookupHuman()`（`agent-book.ts`），內部寫死打 `worldchain.id`，跟傳給 `verifyAgentkitSignature` 的 rpcUrl/chainId 完全無關，兩者原始碼裡沒有互相呼叫，呼叫端要自己依序「先驗簽 → 再拿驗證通過的地址查 humanId」串起來。
- 追進 `client.verifyMessage()` 底層（`viem` 的 `src/actions/public/verifyHash.ts`）發現：預設 `mode:'auto'` 下，EVM 簽名驗證**一律先打一次 RPC `eth_call`**（ERC-6492 universal signature validator 模擬），不管地址是 EOA 還是合約錢包都一樣先打；純本地 `ecrecover` 只是這次 RPC 呼叫拋例外時的 fallback——代表這條路徑**不是**「純本地密碼學」，RPC 品質/可達性會直接影響驗證結果（一個完全正確的簽名可能因為 RPC 掛掉而被判定成 invalid）。
- **relayer 仍要自己做的**：(1) 串接「驗簽 → 查 humanId」兩步呼叫順序；(2) 組出 Robinhood 側 attestation 的 `messageHash` 編碼（對照調查二的 EOAValidator 相容表）；(3) relayer 自己的 raw-hash 簽名——AgentKit 完全不生成任何簽名，只驗證別人的；(4) Robinhood 側獨立的 replay nonce（跟 AgentKit 自己的 SIWE nonce 是不同空間，不能混用）；(5) 實際把 attestation 送上 Robinhood Chain 的交易——AgentKit 對任何目的鏈都不負責送交易。

來源：https://github.com/worldcoin/agentkit/blob/1ec70f7d321bc8dedfe2b6ceb347a8e7d39846ce/core/src/verify.ts 、 `core/src/agent-book.ts`（同 commit）、viem `src/actions/public/verifyHash.ts`（`wevm/viem` repo，`mode:'auto'` 分支）

### 參考實作：poh-aggregator 的 lookupHuman 三態修正

**repo 定位澄清**：追查 `andrevalenm/poh-aggregator` 完整目錄結構（HEAD commit `a26488a`）確認——**這不是純研究筆記**。雖然有 `research/landscape/`、`research/protocols/`、`research/salvage-v1/` 等大量產業調查 markdown，但同一個 repo 同時有真實可執行程式碼：`apps/agent/src/`（JS agent 實作）、`contracts/src/PersonhoodRegistry.sol` + `contracts/test/PersonhoodRegistry.t.sol`（Foundry 合約與測試）、`packages/sdk/src/`（幾十個 adapter，每個都配 `.test.ts`，部分有打真實網路的 `.live.test.ts`）、`packages/mcp/`（MCP server）、`subgraph/`／`subgraph-registry/`（The Graph subgraph，含編譯出的 `.wasm`）、`deployments/sepolia.json`／`deployments/ens-sepolia.json`（實際部署紀錄）、`apps/demo/` 的 Playwright e2e 測試。根目錄 `package.json` 是真實 pnpm workspace monorepo（`workspaces: ["packages/*","apps/*"]`）。

**修正邏輯**：`apps/agent/src/world/agentbook.js` 第 63-82 行
https://github.com/andrevalenm/poh-aggregator/blob/a26488ac8e3a4ed02068d3693856358b81e7e2fd/apps/agent/src/world/agentbook.js#L63-L82

```javascript
export async function lookupHumanBacking(agentAddress) {
  const source = `AgentBook.lookupHuman() on World Chain (${world.agentBookAddress})`
  try {
    const humanId = await client.readContract({
      address: world.agentBookAddress,
      abi: AGENT_BOOK_ABI,
      functionName: 'lookupHuman',
      args: [agentAddress],
    })
    if (humanId === 0n) return { status: 'unbacked', source }
    return { status: 'backed', humanId: humanId.toString(), source }
  } catch (e) {
    // Deliberately not 'unbacked'. A failure to ask is not a negative answer.
    return { status: 'unknown', error: e instanceof Error ? e.message : String(e), source }
  }
}
```

不用官方 `createAgentBookVerifier().lookupHuman()`（會把 RPC 失敗吞成 `null`，跟「真的沒註冊」無法區分），改成自己拿同一份 ABI／合約地址直接 `readContract()`，用三態 `status: 'backed' | 'unbacked' | 'unknown'` 取代官方的布林／null：`humanId === 0n` 才判 `unbacked`（真的沒註冊），任何例外一律 `unknown` 並把 `e.message` 原樣帶出來，跟 `unbacked` 明確分開。

**關鍵註解原文**（同檔案第 15-19 行）：
https://github.com/andrevalenm/poh-aggregator/blob/a26488ac8e3a4ed02068d3693856358b81e7e2fd/apps/agent/src/world/agentbook.js#L15-L19
> "We do not call `createAgentBookVerifier().lookupHuman()` directly, even though we depend on the package. AgentKit's verifier catches RPC failures and returns `null`, which is indistinguishable from "this agent has no human behind it" — a network blip would read as an accusation. We use AgentKit's own contract address and ABI, and surface transport failures as errors. See README, "SDK friction"."

同一份發現在 `apps/agent/README.md` 第 327-337 行「SDK friction」章節也有散文版獨立佐證，並多給一句建議：「Suggested fix: throw, or return a discriminated result.」——GitHub 全站程式碼搜尋確認這句關鍵註解全站僅此一處，非轉載、非本次調查腦補。

**結論**：relayer 實作 lookupHuman 查詢時，建議直接參考這個三態設計（`backed`/`unbacked`/`unknown`），不要用官方 `createAgentBookVerifier()` 的布林／null 回傳——否則 RPC 短暫故障會被誤判成「這個 agent 沒有人類背書」，可能讓 relayer 錯誤拒絕一個其實合法的 attestation 請求。

### 4-3「非官方支援鏈整合」相關討論

用 `gh api search/issues`（title+body 全文搜尋）查 `custom chain`／`unsupported chain`／`bridge`／`new chain`／`add chain`／`non-World` 等關鍵字，在 worldcoin/agentkit repo 裡**沒有找到直接對應「怎麼加新鏈支援」的 issue/討論串**。比較相關的是：
- **Issue #37「RFC: define AgentBook re-registration, revocation, and wallet rotation」**（open）——雖然主題是換錢包/註銷,不是新鏈，但跟"agent 身分跨情境穩定性"這個大主題相關，值得追蹤
- **Issue #29「Integration idea: human-backed agents + escrowed scoped work」**、**Issue #12「Integration proposal: Agent Passport System — scoped delegation + governance on top of World ID」**（都是 open 的社群提案 issue，非官方 roadmap）——內容是「在 World ID 之上疊加委任/託管機制」的概念討論，跟 Robinhood 版 attestation 的委任精神接近，但**不是**專門討論新鏈整合
- **Issue #11「Complementary: agent-wallet-sdk for autonomous agents without World ID」**——反方向的討論（沒有 World ID 的 agent 怎麼辦），间接印证目前 AgentKit 的設計預設就是「World ID 驗證的 agent」，非 World ID 生態的鏈/agent 要接入沒有官方案例可抄，等於要自己設計橋接層（也就是本次調查二在做的事）

結論：**没有找到「custom chain / unsupported chain」的官方 FAQ 或既有討論**——這代表 Robinhood Chain 這種官方未涵蓋的鏈要接 AgentKit，目前**沒有前人踩過的坑可以參考**，純靠調查四第 4-2 節確認的「EVM 驗簽本質上鏈無關，只要給 RPC」這個底層事實去 workaround，屬於本次調查中相對有把握、但仍算「非官方驗證過」的路徑。

來源：
- https://github.com/worldcoin/agentkit （repo 本體，`core/src/*.ts` 全檔已讀）
- https://github.com/worldcoin/agentkit/blob/main/contracts/src/AgentBook.sol
- https://github.com/worldcoin/agentkit/pull/36 、 /pull/39 、 /pull/42 、 /issues/37 、 /issues/29 、 /issues/12 、 /issues/11
- npm: https://www.npmjs.com/package/@worldcoin/agentkit-core

**⚠️ 9/4 需重新確認（風險最高的一項）**：PR #36 / #39 / #42 是否已合併——若合併，`AGENTKIT` header 格式、nonce 介面（`checkNonce` callback → `tryRecordNonce` 原子操作）、甚至整個簽名標準（SIWE → RFC 9421）都可能已經變動，本報告記錄的 `verifyAgentkitSignature`/`validateAgentkitMessage` 介面簽章需要重新讀一次 `main` 分支核對。

---

## 總結：9/4 當天必須重新確認的項目清單

1. `@x402/fetch` / `@x402/evm` 實際安裝版本（很可能已從 2.24.0 再往上跳）是否仍與本報告記錄的 EIP-3009 簽名流程一致
2. The Graph testnet gateway（`testnet.gateway.thegraph.com`）本次沒打通，需要用確定存在的 subgraph ID 重測
3. `worldcoin/agentkit` PR #36 / #39 / #42 合併狀態——這會決定簽名格式跟 nonce 介面是否已經改版（風險最高；`lookupHuman` 把 RPC 失敗跟「未註冊」混成同一個 `null` 的問題目前看來未被這幾個 PR 處理到，relayer 端仍建議自行修正，可參考 poh-aggregator 實作）
4. Robinhood Chain 5 個 Chainlink feed 是否仍存活（不太可能失效，但股票類 feed 有代幣重組風險）
5. `StockPredictionMarket` 實際使用的 `ChainlinkPriceFeed` wrapper 位址（deploy.js 執行當下才產生，未落地記錄，需要重新部署或查 explorer 才能拿到）
