# Crazy Warehouse（反應門檻 × 過勞機制 × 大急單）

> 原名「懶螞蟻公司模擬器」。

依 `SPEC.md` 實作的 ABM + 蒙地卡羅組織韌性模擬器：100 隻糰子、520 週、隨機大急單，比較 6 種管理策略與「備用人力比例」參數掃描。

```bash
npm install
npm run mc              # 無頭 CLI：6 組 × 1000 次 + 掃描 7 點 × 1000 次（約 13 秒）
npm run mc -- --runs=200 --seed=7 --sweep=false
npm test                # 引擎單元測試 + 定性校準測試（全數通過）
npm run test:targets    # SPEC §5 的數值目標區間（目前 3/5 未過，見下方）
npm run dev             # 3D 互動原型
npm run build           # typecheck（含 src/sim 無 DOM 檢查）+ vite build
```

## 架構

| 路徑 | 內容 |
|---|---|
| `src/sim/` | 純 TypeScript 引擎（零 DOM / React / Three）。`tsconfig.sim.json` 以 `lib: ES2022` 單獨編譯來強制這條鐵律 |
| `src/sim/rng.ts` | Mulberry32；環境（工單、急單）與 Agent（門檻、初始體力）用**不同串流**，同一 Seed 下所有實驗組的工單時間軸完全一致（有測試驗證） |
| `src/sim/engine.ts` | `Simulation.step()` 依 SPEC §3.3 六步驟執行，輸出 `Object.freeze` 的 `WeekSnapshot` |
| `src/sim/montecarlo.ts` | `monteCarlo` / `runAllPresets` / `runSweep` |
| `scripts/run-mc.ts` | CLI |
| `src/workers/mc.worker.ts` | 瀏覽器端 1000 次蒙地卡羅（不卡畫面） |
| `src/ui/` | `Scene3D`（InstancedMesh 糰子＋體力條、待辦柱、紅線環、閃燈）、`SplitView`、`ControlPanel`、`McPanel`、`App` |

3D 場景只讀快照並在相鄰兩週之間做 Lerp；播放時鐘由 App 統一驅動，雙視圖共用同一個 Seed 與時鐘。

## 規格中需要詮釋/補齊的地方

1. **常態工單分佈參數遺失**：SPEC 3.1 的公式沒有傳過來。依「急單時總計約 90 件/週」推得均值約 55，最後校準為 `N(50.5, 6²)`（下限截斷 0）。
2. **出勤判定的「剩餘未分配 backlog」**：字面解讀（每指派一人就扣 0.75）下，沒人會做多餘的工作，於是「藍色越多越好」，掃描曲線是單調遞減，不可能出現倒 U。因此新增參數 `allocationPerWorker = 0.46`：每指派一人，後面的人看到的剩餘量只減 0.46。也就是說，大家看到工作堆時會一窩蜂湧上去、互相重疊，浪費體力。這正是「全員都很勤勞 → 同步疲勞」的機制。設成 `null` 即回到字面規則。
3. **RescueBonus 1.25x**：只套用在被召集的高門檻救火隊身上（依 Preset 表「救火隊即時出動且效率 1.25x」）。若套用到全體，存活率會固定在 100%。
4. **初始體力**：SPEC 未定義，設為均勻分佈 `[60, 100]`，避免全員同步。
5. **Surveillance 的座位假忙**：獨立成 `FAKE_BUSY` 狀態（在辦公區、不彈跳、顏色變暗），計算上等同「不回血且 −8」。

## 校準結果（seed 20240520，各 1000 次 × 520 週）

| Preset | 存活率 | SPEC 目標 | 十年總產出 | 平時茶水間 |
|---|---|---|---|---|
| rescue_bonus | **73.1%** | 80–95% ❌ | **23,823**（最高 ✅） | 0.5% |
| baseline | **55.4%** | 65–80% ❌ | 21,125 | 18.3%（目標 20–30% ❌） |
| all_grind | 29.3% | 10–30% ✅ | 16,072 | 0% |
| surveillance | 29.2% | 10–30% ✅ | 16,124 | 0% |
| fire_slackers | 0.0% | 0–5% ✅ | 2,241 | 1.0% |
| true_slackers | 0.0% | 0–5% ✅ | 2,241 | 20.6% |

參數掃描：0% 46.8 → 10% 49.4 → **20% 55.4 → 30% 55.0** → 40% 49.8 → 50% 46.6 → 60% 45.4

**定性排序全部成立**：救火獎金 > 原版 ≫ 全員捲王 ≈ 監控 ≫ 開除摸魚 ≈ 真擺爛；倒 U 型高峰在 20–30%。
**數值區間有 3 項沒達到**：原版與救火組的絕對存活率偏低約 10 個百分點；倒 U 兩端的落差約 9–10 個百分點，SPEC 要求的是「>10pt」。

我用平行隨機搜尋加爬山法，在 `normalMean / normalStd / surgeWorkload / collapseThreshold / staminaDrain / staminaRecover / allocationPerWorker / surveillanceDrain` 的空間中搜尋過，找到的是一條取捨前緣：
- 拉高 baseline，倒 U 就會變平，all_grind/surveillance 也會跟著升到 30% 以上。
- 要倒 U 明顯，就必須提高負載，baseline 隨之掉到 55% 左右。

想全部達標的話，可能需要在模型裡加一個新機制（例如備用人力的「暖機延遲」或協調成本），而不只是調參數。

另外，`staminaDrain 5.9 / staminaRecover 12` 和 SPEC 的初始值（13 / 28）相差很大。調低是因為低門檻者在常態下幾乎每週都會上工，他們只靠過勞來休息。消耗如果維持 13，連 baseline 都撐不過第一年。
