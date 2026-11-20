import { useEffect, useRef, useState } from 'react';
import { PRESET_IDS, PRESETS, SWEEP_RATIOS, type McSummary, type PresetId } from '../sim/index';
import type { McMessage, McRequest } from '../workers/mc.worker';
import Blob from './Blob';
import { INK, LINE, MUTE, PALETTE } from './theme';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function SurvivalBars({ data }: { data: Partial<Record<PresetId, McSummary>> }) {
  const [hover, setHover] = useState<PresetId | null>(null);
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-ink">10 年存活率（各實驗組）</h3>
      <div className="space-y-2">
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
              <span className="truncate text-mute">{PRESETS[id].name}</span>
              <div className="h-3.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-blue-soft transition-[width] duration-500"
                  style={{ width: s ? `${s.survivalRate * 100}%` : 0, opacity: hover && hover !== id ? 0.5 : 1 }}
                />
              </div>
              <span className="text-right font-semibold tabular-nums text-ink">{s ? pct(s.survivalRate) : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SweepChart({ points }: { points: { ratio: number; survivalRate: number }[] }) {
  const W = 320, H = 180, L = 36, R = 12, T = 18, B = 26;
  const x = (r: number) => L + (r / 0.6) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const sorted = [...points].sort((a, b) => a.ratio - b.ratio);
  const [hover, setHover] = useState<number | null>(null);
  const hp = hover === null ? null : sorted.find((p) => p.ratio === hover);
  const peak = sorted.length === SWEEP_RATIOS.length ? sorted.reduce((a, b) => (b.survivalRate > a.survivalRate ? b : a)) : null;
  const tipX = hp ? Math.min(x(hp.ratio) + 8, W - 100) : 0;
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-ink">備用人力比例 vs 10 年存活率</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label="參數掃描曲線">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={LINE} strokeWidth={1} />
            <text x={L - 8} y={y(v) + 3} textAnchor="end" fontSize={9} fill={MUTE}>{v * 100}%</text>
          </g>
        ))}
        {SWEEP_RATIOS.map((r) => (
          <text key={r} x={x(r)} y={H - 8} textAnchor="middle" fontSize={9} fill={MUTE}>{Math.round(r * 100)}%</text>
        ))}
        {sorted.length > 1 && (
          <polyline
            fill="none"
            stroke={PALETTE.blue}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={sorted.map((p) => `${x(p.ratio)},${y(p.survivalRate)}`).join(' ')}
          />
        )}
        {sorted.map((p) => {
          const isPeak = peak?.ratio === p.ratio;
          return (
            <g key={p.ratio} onMouseEnter={() => setHover(p.ratio)} onMouseLeave={() => setHover(null)}>
              <circle cx={x(p.ratio)} cy={y(p.survivalRate)} r={13} fill="transparent" />
              <circle cx={x(p.ratio)} cy={y(p.survivalRate)} r={isPeak ? 6.5 : 4.5} fill={isPeak ? PALETTE.butter : PALETTE.blue} stroke="#fff" strokeWidth={2.5} />
            </g>
          );
        })}
        {peak && (
          <text x={x(peak.ratio)} y={y(peak.survivalRate) - 12} textAnchor="middle" fontSize={9} fontWeight={600} fill={INK}>
            高峰 {pct(peak.survivalRate)}
          </text>
        )}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hp.ratio)} x2={x(hp.ratio)} y1={T} y2={H - B} stroke={LINE} strokeWidth={1.5} strokeDasharray="3 3" />
            <rect x={tipX} y={T + 4} width={92} height={34} rx={12} fill="#fff" stroke={LINE} />
            <text x={tipX + 11} y={T + 18} fontSize={9} fill={MUTE}>備用 {Math.round(hp.ratio * 100)}%</text>
            <text x={tipX + 11} y={T + 31} fontSize={10.5} fill={INK} fontWeight={600}>存活 {pct(hp.survivalRate)}</text>
          </g>
        )}
      </svg>
      <p className="mt-1 text-[11px] text-mute">固定 100 人、一般模式，高門檻（黃）比例 0%–60%</p>
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
    <aside className="flex flex-col gap-6 overflow-y-auto rounded-3xl border border-line bg-white p-5 shadow-[0_6px_24px_rgba(80,100,140,0.08)]">
      <div>
        <button
          className="w-full rounded-full bg-blue-soft px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-95 disabled:opacity-60"
          onClick={run}
          disabled={running}
        >
          {running ? `蒙地卡羅運算中… ${Math.round(progress * 100)}%` : '跑 1,000 次蒙地卡羅'}
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-mute">
          Web Worker 執行，6 組 × 1,000 次 + 掃描 7 點 × 1,000 次，每次 520 週。Seed {seed}
          {ms !== null && `，耗時 ${(ms / 1000).toFixed(1)} 秒`}
        </p>
      </div>
      <SurvivalBars data={presets} />
      <SweepChart points={sweep} />
      <div className="rounded-2xl bg-butter/20 p-4 text-[11px] leading-relaxed text-mute">
        <p className="mb-2 text-xs font-semibold text-ink">圖例</p>
        <p className="flex items-center gap-2"><Blob color={PALETTE.blue} size={14} /> 勤勞藍（門檻 0–10）</p>
        <p className="mt-1 flex items-center gap-2"><Blob color={PALETTE.butter} size={14} /> 高門檻黃（門檻 22–34）</p>
        <p className="mt-1 flex items-center gap-2"><Blob color={PALETTE.lavender} size={14} /> 真擺爛紫（永不出勤）</p>
        <p className="mt-2">頭頂細條＝體力（低於 30 轉珊瑚色）；中央疊疊樂＝待辦量，珊瑚環＝倒閉紅線，超過救火警戒會閃爍。</p>
      </div>
    </aside>
  );
}
