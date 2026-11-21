# Crazy Warehouse（原名：懶螞蟻公司）— 專案交接

使用者偏好：**一律用繁體中文回覆**。

## 這是什麼
基於代理人基模型（ABM）+ 蒙地卡羅的組織韌性模擬器，驗證「高反應門檻員工（看似摸魚的備用人力）」在突發大急單衝擊下對公司存活率的影響。
專案在 `crazy-warehouse/`。**開工前先讀 `crazy-warehouse/SPEC.md`（原始規格）和 `crazy-warehouse/README.md`（規格詮釋與校準結果）。**
（倉庫根目錄的 `reports/` 是別的東西，與此專案無關。）

開發分支：`claude/amazing-davinci-8bfx5h`。除非使用者要求，不要建立 PR。

## 指令（在 `crazy-warehouse/` 內執行）
| 指令 | 用途 |
|---|---|
| `npm run mc` | 無頭蒙地卡羅：6 組 × 1000 次 + 掃描 7 點（約 13 秒）。可加 `-- --runs=200 --seed=7 --sweep=false` |
| `npm test` | 引擎單元測試 + 定性校準（16 項，應全過） |
| `npm run test:targets` | SPEC §5 的數值目標區間（目前 3/5 未過，屬已知） |
| `npm run typecheck` | 型別檢查，含 `src/sim` 的「無 DOM」單獨編譯 |
| `npm run dev` / `npm run build` | 3D 原型 / 打包 |

## 架構鐵律（不可違反）
1. `src/sim/` 是純 TypeScript：零 DOM、零 React、零 Three.js。`tsconfig.sim.json` 以 `lib: ES2022` 強制檢查。
2. 引擎內禁止 `Math.random()`，只用 `src/sim/rng.ts` 的 Mulberry32。工單/急單（環境串流）與 Agent（門檻、初始體力）用**不同亂數串流**，所以同一 Seed 下所有實驗組的工單時間軸完全相同（有測試）。
3. 單向資料流：引擎每週輸出 `Object.freeze` 的 `WeekSnapshot`；3D 只讀快照並 Lerp，不做業務計算。
4. 模擬行為改動前後都要跑 `npm test`；動到參數要重新看 `npm run mc` 的結果。

## 目前進度
- Phase 1–3 皆完成：引擎、CLI、Vitest、3D 單視圖互動原型（雙視圖已依使用者要求移除）。
- UI：白底、**只用四個色相**（柔藍 `#86BEE8`／奶油黃 `#F4D58A`／薰衣草紫 `#B9A8E8`／珊瑚粉 `#F5A59B`）加中性灰；圓角卡片與藥丸按鈕；不要用 emoji（會破壞四色限制）。色票集中在 `src/ui/theme.ts` 與 `src/index.css` 的 `@theme`。
- 糰子：圓滾滾、兩隻腳、兩顆眼睛；身體/雙腳/雙眼/體力條各一個 InstancedMesh（`src/ui/Scene3D.tsx`）。

## 規格詮釋（SPEC 沒寫清楚、我自行決定的）
- 常態工單分佈參數遺失 → `N(50.5, 6²)`，下限截斷 0。
- 出勤判定加 `allocationPerWorker = 0.46`（每指派一人，後面的人看到的剩餘量只減 0.46）；字面規則下不可能出現倒 U。設 `null` 回到字面規則。
- RescueBonus 的 1.25x 只給被召集的高門檻救火隊；套用全體會讓存活率變 100%。
- 初始體力均勻 `[60, 100]`；Surveillance 座位假忙為獨立狀態 `FAKE_BUSY`。
- 體力消耗/回復調成 5.9 / 12（SPEC 的 13 / 28 會讓原版公司第一年就倒）。

## 校準結果與已知缺口（seed 20240520，1000 次）
rescue_bonus 73.1%（目標 80–95% ❌）、baseline 55.4%（目標 65–80% ❌，平時茶水間 18% 低於 20–30% ❌）、all_grind 29.3% ✅、surveillance 29.2% ✅、fire_slackers 0% ✅、true_slackers 0% ✅。掃描高峰在 20–30% ✅，但兩端只低約 9–10 個百分點。
定性排序全部成立。已用隨機搜尋 + 爬山法證實是取捨前緣：要全達標可能需要新機制（例如備用人力暖機延遲、協調成本），而不是調參數。

## 踩過的坑
- **不要用 drei 的 `RoundedBox` 做地板**：圓角大於厚度時會把地板墊高、蓋住桌子。改用 three 內建 `RoundedBoxGeometry`（會自動限制半徑）。
- Canvas 要開 `flat`（關閉 tone mapping），粉彩色票才不會被壓暗變灰。
- three.js 燈光是物理單位：朝上表面需約 π 的總照度，白色才會顯示成白色。
- InstancedMesh 的矩陣請在 `useFrame` 內每幀寫入，並設 `frustumCulled={false}`。
- 手機寬度要確認沒有橫向捲動（根容器 `overflow-x-hidden`、grid 用 `minmax(0,1fr)`）。

## 下一步（使用者已表示感興趣，等確認後再做）：派工視覺化
1. 「逐步」模式：一週拆成引擎六步慢動作，畫面上方顯示目前步驟。
2. 待辦柱旁的「派工水位線」：糰子頭上標門檻，依門檻由低到高被叫到時跳起、冒出工單方塊，水位線隨之下降；水位低於下一人門檻，其後的人去茶水間。
3. 點選糰子彈出小卡片：角色、門檻、體力、「剩餘 31 ≥ 門檻 24，被派工」。
4. 底部時間軸：待辦量折線 + 急單色塊，可拖曳跳週。
需要在 `WeekSnapshot` 為每位 Agent 加「派工時看到的剩餘量」欄位；只多輸出資料，不得改變模擬結果。
