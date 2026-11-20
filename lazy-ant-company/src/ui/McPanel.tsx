import { useEffect, useRef, useState } from 'react';
import { PRESET_IDS, PRESETS, SWEEP_RATIOS, type McSummary, type PresetId } from '../sim/index';
import type { McMessage, McRequest } from '../workers/mc.worker';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const BAR = '#38bdf8';
const BAR_DIM = '#334155';

function SurvivalBars({ data }: { data: Partial<Record<PresetId, McSummary>> }) {
  const [hover, setHover] = useState<PresetId | null>(null);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-200">10 年存活率（各實驗組）</h3>
      <div className="space-y-1.5">
        {PRESET_IDS.map((id) => {
          const s = data[id];
          return (
            <div
              key={id}
              className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs"
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              title={s ? `${PRESETS[id].name}｜存活 ${pct(s.survivalRate)}｜平均十年產出 ${s.meanTotalOutput.toFixed(0)}` : ''}
            >
              <span className="truncate text-slate-300">{PRESETS[id].name}</span>
              <div className="h-3.5 rounded-sm" style={{ background: BAR_DIM }}>
                <div
                  className="h-full rounded-r transition-[width] duration-500"
                  style={{ width: s ? `${s.survivalRate * 100}%` : 0, background: BAR, opacity: hover && hover !== id ? 0.55 : 1 }}
                />
              </div>
              <span className="text-right tabular-nums text-slate-200">{s ? pct(s.survivalRate) : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SweepChart({ points }: { points: { ratio: number; survivalRate: number }[] }) {
  const W = 320, H = 170, L = 34, R = 10, T = 10, B = 26;
  const x = (r: number) => L + (r / 0.6) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const sorted = [...points].sort((a, b) => a.ratio - b.ratio);
  const [hover, setHover] = useState<number | null>(null);
  const hp = hover === null ? null : sorted.find((p) => p.ratio === hover);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-200">備用人力比例 vs 10 年存活率</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label="參數掃描曲線">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#334155" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{v * 100}%</text>
          </g>
        ))}
        {SWEEP_RATIOS.map((r) => (
          <text key={r} x={x(r)} y={H - 8} textAnchor="middle" fontSize={9} fill="#94a3b8">{Math.round(r * 100)}%</text>
        ))}
        {sorted.length > 1 && (
          <polyline fill="none" stroke={BAR} strokeWidth={2} points={sorted.map((p) => `${x(p.ratio)},${y(p.survivalRate)}`).join(' ')} />
        )}
        {sorted.map((p) => (
          <g key={p.ratio} onMouseEnter={() => setHover(p.ratio)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(p.ratio)} cy={y(p.survivalRate)} r={12} fill="transparent" />
            <circle cx={x(p.ratio)} cy={y(p.survivalRate)} r={4} fill={BAR} stroke="#0f172a" strokeWidth={2} />
          </g>
        ))}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hp.ratio)} x2={x(hp.ratio)} y1={T} y2={H - B} stroke="#64748b" strokeDasharray="3 3" />
            <rect x={Math.min(x(hp.ratio) + 6, W - 96)} y={T} width={90} height={30} rx={4} fill="#0f172a" stroke="#475569" />
            <text x={Math.min(x(hp.ratio) + 12, W - 90)} y={T + 13} fontSize={9} fill="#cbd5e1">備用 {Math.round(hp.ratio * 100)}%</text>
            <text x={Math.min(x(hp.ratio) + 12, W - 90)} y={T + 25} fontSize={10} fill="#f8fafc" fontWeight={600}>存活 {pct(hp.survivalRate)}</text>
          </g>
        )}
      </svg>
      <p className="text-[11px] text-slate-500">固定 100 人、一般模式，高門檻（黃）比例 0%–60%</p>
    </div>
  );
}

export default function McPanel({ seed }: { seed: number }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [presets, setPresets] = useState<Partial<Record<PresetId, McSummary>>>({});
  const [sweep, setSweep] = useState<{ ratio: number; survivalRate: number }[]>([]);
  const [ms, setMs] = useState<number | null>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('../workers/mc.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setPresets({});
    setSweep([]);
    setMs(null);
    setProgress(0);
    setRunning(true);
    w.onmessage = (e: MessageEvent<McMessage>) => {
      const m = e.data;
      if (m.type === 'preset') {
        setPresets((p) => ({ ...p, [m.summary.id]: m.summary }));
        setProgress(m.done / m.total);
      } else if (m.type === 'sweep') {
        setSweep((s) => [...s, { ratio: m.ratio, survivalRate: m.survivalRate }]);
        setProgress(m.done / m.total);
      } else {
        setMs(m.ms);
        setRunning(false);
        w.terminate();
      }
    };
    w.postMessage({ runs: 1000, seed } satisfies McRequest);
  };

  return (
    <aside className="flex flex-col gap-5 overflow-y-auto border-l border-slate-700 bg-slate-900 p-4">
      <div>
        <button
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50"
          onClick={run}
          disabled={running}
        >
          {running ? `蒙地卡羅運算中… ${Math.round(progress * 100)}%` : '🎲 跑 1,000 次蒙地卡羅'}
        </button>
        <p className="mt-1 text-[11px] text-slate-500">
          Web Worker 執行，6 組 × 1,000 次 + 掃描 7 點 × 1,000 次，每次 520 週。Seed {seed}
          {ms !== null && `，耗時 ${(ms / 1000).toFixed(1)} 秒`}
        </p>
      </div>
      <SurvivalBars data={presets} />
      <SweepChart points={sweep} />
      <div className="text-[11px] leading-relaxed text-slate-400">
        <p className="mb-1 font-semibold text-slate-300">圖例</p>
        <p><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500 align-middle" /> 勤勞藍（門檻 0–10）</p>
        <p><span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400 align-middle" /> 高門檻黃（門檻 22–34）</p>
        <p><span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500 align-middle" /> 真擺爛紫（永不出勤）</p>
        <p className="mt-1">頭頂細條＝體力；中央柱＝待辦量，紅環＝倒閉紅線，超過救火警戒時閃紅燈。</p>
      </div>
    </aside>
  );
}
