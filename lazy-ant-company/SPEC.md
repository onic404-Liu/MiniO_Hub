# SPEC.md — 懶螞蟻公司（反應門檻與過勞機制）3D ABM 模擬器

> 由使用者提供的原始規格。第 3.1 節「常態每週新工單」的分佈參數在傳遞時遺失，實作的取值見 README。

## 1. 專案目標與架構原則
本專案實作一個基於代理人基模型（ABM）與蒙地卡羅模擬（Monte Carlo）的組織韌性模擬器，驗證「高反應門檻員工（看似摸魚的備用人力）」在突發大急單衝擊下對系統存活率的影響。

核心架構鐵律
1. 運算與視覺完全解耦：`src/sim/` 下所有程式碼必須是純 TypeScript（零 DOM、零 React、零 Three.js 依賴），可直接在 Node.js CLI、Vitest 與瀏覽器 Web Worker 中執行。
2. 完全可重現（Deterministic）：禁止在模擬引擎內使用 `Math.random()`，一律使用內建的 Mulberry32 Seeded PRNG，確保相同 Seed 在不同實驗組會遇到完全一致的工單與大急單時間軸。
3. 單向資料流：引擎每週輸出不可變的 `WeekSnapshot`，3D 場景只負責讀取快照並執行補間動畫（Lerp），不參與任何業務邏輯計算。

## 2. 技術棧與目錄結構
- 核心與前端：Vite + React + TypeScript + Tailwind CSS
- 3D 渲染：Three.js（@react-three/fiber, @react-three/drei），使用 InstancedMesh 繪製 100 隻糰子
- 測試與 CLI：Vitest + tsx（執行無頭蒙地卡羅腳本）

## 3. 核心數學模型與狀態機
### 3.1 時間尺度與公司參數
- 模擬總長：520 週（10 年）
- 標準編制：100 隻糰子（FireSlackers 組為 80 隻）
- 常態每週新工單：常態分佈（參數遺失；下限截斷為 0）
- 大急單事件（Surge）：非急單狀態下每週觸發機率 pSurge = 1.5 / 52；每次持續 3 週，期間每週額外增加 35 件工單（總計約 90 件/週）
- 公司倒閉紅線：當週結算後 backlog > 60 即判定倒閉（collapsed = true），紀錄 collapseWeek 並提前結束該次模擬。

### 3.2 Agent 屬性與角色分類
- LOW_THRESHOLD（勤勞藍）：threshold 均勻分佈於 [0, 10]
- HIGH_THRESHOLD（高門檻黃）：threshold 均勻分佈於 [22, 34]
- TRUE_SLACKER（真擺爛紫）：threshold = Infinity（永遠不出勤）

### 3.3 每週 Tick 執行順序（不可調換）
1. 工單湧入：計算本週新工單（常態 + 若處於急單則加急單量），累加至 backlog。
2. 過勞狀態更新：BURNOUT 者 burnoutWeeksLeft - 1；歸零時恢復為 RESTING 且 stamina = 45。
3. 出勤判定：篩選所有非 BURNOUT 的 Agent，依 threshold 由低到高排序（同門檻者依 stamina 由高到低），依序判斷：
   - 一般模式：當前剩餘未分配 backlog >= agent.threshold 且 backlog > 0。
   - AllGrind：所有非過勞人員強制 WORKING（即使沒真實工單也做假忙報表）。
   - Surveillance：符合門檻者 WORKING，其餘人員被迫在座位上假忙（視為 RESTING 但體力不回復且額外扣血）。
   - RescueBonus：當 backlog >= 20（紅燈警戒）時，所有 HIGH_THRESHOLD 人員立即啟動救火，本週產出享 1.25x 加成。
4. 產出結算：每位實際投入真實工單的 WORKING Agent 單週產出 0.75 件（RescueBonus 危機時為 0.94）；從 backlog 扣除（最低 0），累加 totalOutput。
5. 體力與過勞結算：WORKING −13；Surveillance 座位假忙 −8；RESTING `min(100, stamina + 28)`；若 stamina <= 0 → BURNOUT，stamina = 0、burnoutWeeksLeft = 2。
6. 倒閉判定：若 backlog > 60，標記 collapsed 並停止模擬。

## 4. 實驗組設計
| Preset ID | 名稱 | 組成 | 特殊規則 |
|---|---|---|---|
| baseline | 原版公司（28 法則） | 80 藍 + 20 黃 | 標準門檻與茶水間規則 |
| fire_slackers | 開除摸魚組 | 80 藍 | 移除 20 隻高門檻員工 |
| all_grind | 全員捲王 | 100 藍 | 拆除茶水間，全員門檻歸零、每週強制滿載 |
| true_slackers | 真擺爛公司 | 80 藍 + 20 紫 | 高門檻替換為危機也不動的真擺爛 |
| surveillance | 裝監控盯梢 | 80 藍 + 20 黃 | 禁止進茶水間，沒事時假忙扣體力 (−8) |
| rescue_bonus | 留餘裕＋救火獎金 | 80 藍 + 20 黃 | 平常安心回血，紅燈時救火隊即時出動且效率 1.25x |

參數掃描：固定 100 人，HIGH_THRESHOLD 比例 0%–60%（每 10%）各跑 1,000 次 10 年模擬，輸出倒 U 型曲線。

## 5. 數值校準目標
1. rescue_bonus 存活率最高（80%–95%），且平均十年總產出最高。
2. baseline 次之（65%–80%），平時茶水間約 20%–30% 糰子休息。
3. all_grind 與 surveillance 崩跌（10%–30%）。
4. fire_slackers 與 true_slackers 幾乎全滅（0%–5%）。
5. 參數掃描在 20%–30% 達到高峰，低於 10% 或高於 50% 皆明顯下滑。

可微調 staminaDrain、staminaRecover、surgeWorkload、collapseThreshold。

## 6. 3D 視覺化與互動規格
- 辦公區（左）10×10 格位，工作中彈跳；茶水間（右上）綠地板；過勞休養區（右下）灰地板，倒下並閃紅光。
- 單一 InstancedMesh 膠囊體：藍 / 黃 / 紫。
- 辦公區中央待辦任務堆疊柱，紅色警戒環對應 backlog = 60；超過 20 時閃爍紅燈。
- 單視圖／雙視圖並排（共用 Seed）；暫停、單週步進、1x/5x/20x、跳轉至下一次大急單；Web Worker 跑 1,000 次蒙地卡羅並更新長條圖與掃描曲線。

## 7. 分階段開發
- Phase 1：無頭引擎＋CLI
- Phase 2：數值校準＋單元測試
- Phase 3：Scene3D.tsx、ControlPanel.tsx、SplitView.tsx、mc.worker.ts
