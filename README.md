# Project Pulse · 專案管理儀表板

一眼掌握所有**專案型、常態型、一次性任務**的進度與每週狀態，快速找出問題，並一鍵把週報輸出成 PDF 給老闆看。

## 功能

- **三種任務類型**：專案型 / 常態型 / 一次性，分組管理。
- **團隊與角色**：每個專案可指派成員、設定**負責人**，成員可給不同角色（負責人 / 成員 / 檢視者 + 自訂角色文字）；可用 Email 邀請尚未有帳號的人。
- **進度追蹤**：狀態、優先序、開始 / 結束日、整體進度 %、紅黃綠燈健康度。
- **每週進度紀錄**：本週目標 / 本週完成 / 整體進度 % / 下週目標 / 風險阻礙 / 需老闆決策；同一週去重、可編輯。
- **歷史趨勢圖**：點進專案看進度折線圖（X 軸時間、點依紅黃綠燈著色）+ 全部每週紀錄。
- **總覽 Dashboard**：所有任務的當週狀態一覽，自動標出「需要關注」「需老闆決策」「本週未更新」。
- **時程藍圖（甘特風）**：各專案**理想時程**（淺色橫條）對比**現實進度**（深色填充），里程碑顯示計畫日 vs 實際達成日、目標 ★、今日線。
- **一鍵週報**：仿儀表板樣式的週報頁，可切換週次，瀏覽器「列印 / 存成 PDF」即得 A4 橫向報告。
- **應用程式安裝**：管理者可自行決定公司要開哪些模組（見下方「應用程式（模組）系統」）。
- **食品標示（垂直應用）**：把日本商品的「栄養成分表示」轉換成台灣的營養標示，並列出台灣強制標示的缺口；支援上傳包裝照片 OCR 自動填表（需 `GOOGLE_API_KEY`），可掛在 CRM 商機底下。

## 應用程式（模組）系統

側欄的每一頁都是一個**模組**，模組的可見性有三層閘門，三層是 AND 關係：

| 層 | 誰決定 | 存在哪 |
|---|---|---|
| 平台 | 開發 / 部署 | `src/lib/modules.ts` 的 `MODULES`（這個版本存在哪些模組） |
| **組織** | **OWNER / ADMIN** | `OrganizationModule` 資料表，於 `/apps`「應用程式」頁安裝 / 停用 |
| 成員 | ADMIN / 自訂角色 | `OrganizationMember.allowedModules`、`OrgRoleDef.visibleModules`、權限 |

組織沒安裝的模組，**連 OWNER 都看不到**——他要先去「應用程式」頁安裝。這樣「側欄有沒有這一頁」
才會等於「公司有沒有開這個模組」，而不是各人權限拼湊出來的結果。

- 標記 `core: true` 的模組（總覽 / 每日報告 / 待辦 / 打卡 / 個人資料 / 應用程式）不吃組織層閘門，永遠可用。
- 停用（`enabled: false`）與移除安裝**都不會刪掉模組的資料**，重新安裝即回復。
- 組織層閘門同時擋頁面與寫入：模組的 server action 一律先過 `requireInstalledModule(key)`。

### 新增一個模組

1. `src/lib/modules.ts`：`ModuleKey` 加一個 key，`MODULES` 加一筆（含 `description` / `category`，供安裝頁顯示）。
2. `src/components/app-sidebar.tsx`：`NAV_SECTIONS` 加一個側欄項目。
3. `src/app/(app)/<key>/layout.tsx`：`await requireModuleAccess("<key>")`。
4. 模組的 server action 開頭加 `await requireInstalledModule("<key>")`。
5. 要預設安裝就讓它進 `DEFAULT_INSTALLED_MODULES`（目前規則：非「垂直應用」分類者預設安裝）。
6. 若模組要有自己的資料表，照常加 Prisma model（記得帶 `organizationId`）。
7. 模組若有純邏輯（計算 / 規則判定），放在 `src/lib/<key>/` 並在 `tests/` 補測試——
   保持「純函式、不相依資料庫」才測得動，也才能在 server action 與 UI 之間共用同一份。

## 技術

Next.js 16（App Router）· React 19 · TypeScript · Tailwind v4 · shadcn/ui（Base UI）· Prisma 7 + Postgres · Auth.js (NextAuth v5, Google 登入) · Recharts。

---

## 本機開發

### 1. 資料庫（本機用 Docker Postgres）

```bash
docker run -d --name pm-tracker-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pmtracker \
  -p 5455:5432 postgres:17
```

> 預設 `.env` 的 `DATABASE_URL` 已指向 `127.0.0.1:5455`。若該 port 被占用，換一個並同步改 `.env`。
> （用 `127.0.0.1` 而非 `localhost`，避免 Windows 上 IPv6/Docker 的連線問題。）

### 2. 安裝、建表、植入範例資料

```bash
bun install
bun run db:migrate      # 套用 migration（首次會建立資料表）
bun run db:seed         # 植入 11 個範例專案 + 團隊成員 + 幾週週報（可選）
```

### 3. 啟動

```bash
bun run dev             # http://localhost:3000
```

開發模式下 `.env` 的 `ALLOW_DEV_LOGIN=1` 會在登入頁顯示「開發者快速登入」，輸入任意 Email 即可登入（會自動建立帳號）。
範例資料的負責人是 `dev@korvva.com`，用這個 Email 登入即可看到全部資料。

### 常用指令

| 指令 | 說明 |
|------|------|
| `bun run dev` | 開發伺服器 |
| `bun run build` | 正式打包（會先 `prisma generate`） |
| `bun run check` | ESLint + 型別檢查 + 測試（程式碼把關，CI 跑的也是這三項） |
| `bun run test` | 純函式測試（規則引擎、模組閘門） |
| `bun run db:migrate` | 建立 / 套用 migration（本機開發） |
| `bun run db:deploy` | 套用既有 migration（正式環境用） |
| `bun run db:studio` | Prisma Studio 看資料 |
| `bun run db:seed` | 植入範例資料（已存在則略過；`--force` 可重置） |

### 測試

沒有引入測試框架——目前測的都是純函式，`tsc` 編譯 + node 內建的 test runner 就夠，
不必為此多一包相依。`tsconfig.test.json` 把要測的檔案編成 CommonJS 放進 `.test-build/`，
再交給 `node --test` 跑。

涵蓋範圍（`tests/`）：

| 檔案 | 測什麼 |
|------|--------|
| `foodlabel-engine.test.ts` | 日本標示 → 台灣營養標示的換算：欄位辨識、標示基準、食鹽相當量換算鈉、糖質＋食物繊維、數值修整、得以 0 標示、每日參考值、合規缺口與邏輯檢查 |
| `modules-access.test.ts` | 模組可見性的三層閘門：組織已安裝 → 成員可見 → 具備權限，以及安裝清單的設定（core / adminOnly / 預設安裝） |

要測的邏輯請盡量留在 `src/lib/` 底下、不要相依資料庫；碰 DB 或 React 的部分目前
不在測試範圍內（會需要另外引入測試框架，屆時再評估）。

> 食品標示的規則引擎另有一份原型在 `jp2tw-food-label/`（獨立的 Next.js 專案）。
> **這裡的 `src/lib/foodlabel/` 才是正本**，兩邊已經分家，修規則請改這裡。

---

## 環境變數（`.env`）

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | Postgres 連線字串。本機 Docker；正式環境用 Neon（需 `?sslmode=require`）。 |
| `AUTH_SECRET` | Auth.js 加密金鑰，用 `openssl rand -base64 32` 產生。 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client。填了才會出現「用 Google 登入」。 |
| `ALLOW_DEV_LOGIN` | `1` 啟用開發者快速登入；**正式環境請設 `0`**。 |

### 設定 Google 登入

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → 建立 **OAuth client ID**（Web application）。
2. **Authorized redirect URI** 加入：
   - 本機：`http://localhost:3000/api/auth/callback/google`
   - 正式：`https://<你的網域>/api/auth/callback/google`
3. 把 client id / secret 填入 `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`，重啟即可。

---

## 部署到 Vercel + Neon

1. **Neon**：建一個 Postgres，複製連線字串（含 `?sslmode=require`）。
2. **Vercel**：匯入此專案，設定環境變數 `DATABASE_URL`、`AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`，並把 `ALLOW_DEV_LOGIN` 設 `0`（或不設）。
3. Build 指令維持預設（`bun run build`，內含 `prisma generate`）。
4. 第一次部署後，對正式 DB 套用 schema：本機把 `DATABASE_URL` 暫指向 Neon 後執行 `bun run db:deploy`（或在 CI 跑）。
5. 到 Google OAuth 把正式網域的 redirect URI 加進去。

> Auth.js 已開 `trustHost: true`，Vercel 上不需額外設 `AUTH_URL`。

---

## 每週使用流程

1. **新增專案 / 任務**（側欄按鈕）→ 選類型、指派負責人與成員、填起訖日與目標。
2. 進專案詳情 → **新增本週進度**（目標 / 完成 / 進度 / 風險 / 需決策），並在「里程碑」設定理想日與目標。
3. **總覽**隨時看所有任務當週狀態，紅黃燈與「需老闆決策」一眼揪出問題。
4. 週五 → 開**週報**頁 → 「列印 / 存成 PDF」→ 寄給老闆。
