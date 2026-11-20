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

const btn =
  'whitespace-nowrap rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800';
const btnOn = 'border-sky-400 bg-sky-900/60';

function PresetSelect({ value, onChange, label }: { value: PresetId; onChange: (id: PresetId) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-400">{label}</span>
      <select
        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value as PresetId)}
      >
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-700 bg-slate-900 px-4 py-2">
      <div className="flex gap-1">
        <button className={`${btn} ${!p.split ? btnOn : ''}`} onClick={() => p.onSplit(false)}>
          單視圖
        </button>
        <button className={`${btn} ${p.split ? btnOn : ''}`} onClick={() => p.onSplit(true)}>
          雙視圖對照
        </button>
      </div>
      <PresetSelect label={p.split ? 'A' : '實驗組'} value={p.presetA} onChange={p.onPresetA} />
      {p.split && <PresetSelect label="B" value={p.presetB} onChange={p.onPresetB} />}
      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Seed</span>
        <input
          type="number"
          className="w-28 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5"
          value={p.seed}
          onChange={(e) => p.onSeed(Number(e.target.value) >>> 0)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <button className={btn} onClick={() => p.onPlay(!p.playing)} disabled={ended}>
          {p.playing ? '⏸ 暫停' : '▶ 播放'}
        </button>
        <button className={btn} onClick={p.onStep} disabled={ended}>
          ⏭ 單週
        </button>
        {([1, 5, 20] as const).map((s) => (
          <button key={s} className={`${btn} ${p.speed === s ? btnOn : ''}`} onClick={() => p.onSpeed(s)}>
            {s}x
          </button>
        ))}
        <button className={btn} onClick={p.onNextSurge} disabled={ended}>
          ⚡ 跳到下次大急單
        </button>
        <button className={btn} onClick={p.onReset}>
          ↺ 重來
        </button>
      </div>
      <div className="ml-auto text-sm tabular-nums text-slate-300">
        第 <span className="font-semibold text-white">{p.week}</span> / {p.maxWeek} 週（{(p.week / 52).toFixed(1)} 年）
      </div>
    </div>
  );
}
