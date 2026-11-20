import { PRESET_IDS, PRESETS, type PresetId } from '../sim/index';

export type Speed = 1 | 5 | 20;

interface Props {
  split: boolean;
  onSplit: (v: boolean) => void;
  presetA: PresetId;
  presetB: PresetId;
  onPresetA: (id: PresetId) => void;
  onPresetB: (id: PresetId) => void;
  seed: number;
  onSeed: (s: number) => void;
  playing: boolean;
  onPlay: (v: boolean) => void;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  onStep: () => void;
  onNextSurge: () => void;
  onReset: () => void;
  week: number;
  maxWeek: number;
}

const pill = (on = false) =>
  `whitespace-nowrap rounded-full border px-4 py-1.5 text-sm text-ink transition disabled:opacity-40 ${
    on ? 'border-blue-soft bg-blue-soft/30 font-semibold' : 'border-line bg-white hover:bg-blue-soft/15 disabled:hover:bg-white'
  }`;
const field =
  'rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-blue-soft';

function PresetSelect({ value, onChange, label }: { value: PresetId; onChange: (id: PresetId) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-mute">{label}</span>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value as PresetId)}>
        {PRESET_IDS.map((id) => (
          <option key={id} value={id}>
            {PRESETS[id].name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ControlPanel(p: Props) {
  const ended = p.week >= p.maxWeek;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border border-line bg-white px-5 py-3 shadow-[0_6px_24px_rgba(80,100,140,0.08)]">
      <div className="flex gap-1">
        <button className={pill(!p.split)} onClick={() => p.onSplit(false)}>
          單視圖
        </button>
        <button className={pill(p.split)} onClick={() => p.onSplit(true)}>
          雙視圖對照
        </button>
      </div>
      <PresetSelect label={p.split ? 'A' : '實驗組'} value={p.presetA} onChange={p.onPresetA} />
      {p.split && <PresetSelect label="B" value={p.presetB} onChange={p.onPresetB} />}
      <label className="flex items-center gap-2 text-sm">
        <span className="text-mute">Seed</span>
        <input type="number" className={`${field} w-28`} value={p.seed} onChange={(e) => p.onSeed(Number(e.target.value) >>> 0)} />
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <button
          className="whitespace-nowrap rounded-full border border-blue-soft bg-blue-soft px-5 py-1.5 text-sm font-semibold text-ink transition hover:brightness-95 disabled:opacity-40"
          onClick={() => p.onPlay(!p.playing)}
          disabled={ended}
        >
          {p.playing ? '暫停' : '播放'}
        </button>
        <button className={pill()} onClick={p.onStep} disabled={ended}>
          單週 ›
        </button>
        {([1, 5, 20] as const).map((s) => (
          <button key={s} className={pill(p.speed === s)} onClick={() => p.onSpeed(s)}>
            {s}x
          </button>
        ))}
        <button className={pill()} onClick={p.onNextSurge} disabled={ended}>
          跳到下次大急單 »
        </button>
        <button className={pill()} onClick={p.onReset}>
          重來 ↺
        </button>
      </div>
      <div className="ml-auto text-sm tabular-nums text-mute">
        第 <span className="font-semibold text-ink">{p.week}</span> / {p.maxWeek} 週（{(p.week / 52).toFixed(1)} 年）
      </div>
    </div>
  );
}
