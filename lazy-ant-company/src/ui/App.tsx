import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeConfig, runWithSnapshots, type PresetId } from '../sim/index';
import ControlPanel, { type Speed } from './ControlPanel';
import Blob from './Blob';
import McPanel from './McPanel';
import type { PlaybackClock } from './Scene3D';
import SplitView, { type ViewRun } from './SplitView';
import { PALETTE } from './theme';

function useRun(id: PresetId, seed: number): ViewRun {
  return useMemo(() => {
    const config = makeConfig(id);
    return { config, snapshots: runWithSnapshots(config, seed).snapshots };
  }, [id, seed]);
}

export default function App() {
  const [split, setSplit] = useState(true);
  const [presetA, setPresetA] = useState<PresetId>('baseline');
  const [presetB, setPresetB] = useState<PresetId>('fire_slackers');
  const [seed, setSeed] = useState(42);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [week, setWeek] = useState(0);
  const clock = useRef<PlaybackClock>({ t: 0 });

  const runA = useRun(presetA, seed);
  const runB = useRun(presetB, seed);
  const runs = split ? [runA, runB] : [runA];
  const maxIndex = Math.max(...runs.map((r) => r.snapshots.length - 1));
  const maxRef = useRef(maxIndex);
  maxRef.current = maxIndex;

  // The single shared clock (both views use the same seed, so the same timeline).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock.current.t = Math.min(maxRef.current, clock.current.t + dt * speed);
      setWeek(Math.round(clock.current.t));
      if (clock.current.t >= maxRef.current) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const jump = useCallback((t: number) => {
    clock.current.t = Math.max(0, Math.min(maxRef.current, t));
    setWeek(Math.round(clock.current.t));
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    jump(0);
  }, [jump]);

  // New seed / preset → restart from week 0.
  useEffect(reset, [seed, presetA, presetB, split, reset]);

  const step = () => {
    setPlaying(false);
    jump(Math.round(clock.current.t) + 1);
  };

  const nextSurge = () => {
    const longest = runs.reduce((a, b) => (b.snapshots.length > a.snapshots.length ? b : a));
    const from = Math.round(clock.current.t) + 1;
    const k = longest.snapshots.findIndex((s, i) => i >= from && s.surgeStarted);
    if (k >= 0) jump(k - 1);
    else jump(maxIndex);
  };

  return (
    <div className="flex h-full flex-col overflow-x-hidden bg-white text-ink">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 pt-4 pb-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Blob color={PALETTE.blue} size={22} />
          懶螞蟻公司模擬器
        </h1>
        <p className="text-xs text-mute">反應門檻 × 過勞機制 × 大急單衝擊 · 3D ABM</p>
      </header>
      <div className="px-4">
      <ControlPanel
        split={split}
        onSplit={setSplit}
        presetA={presetA}
        presetB={presetB}
        onPresetA={setPresetA}
        onPresetB={setPresetB}
        seed={seed}
        onSeed={setSeed}
        playing={playing}
        onPlay={setPlaying}
        speed={speed}
        onSpeed={setSpeed}
        onStep={step}
        onNextSurge={nextSurge}
        onReset={reset}
        week={week}
        maxWeek={maxIndex}
      />
      </div>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-[70vh] min-w-0 lg:min-h-0">
          <SplitView runs={runs} clock={clock} week={week} />
        </div>
        <McPanel seed={seed} />
      </main>
    </div>
  );
}
