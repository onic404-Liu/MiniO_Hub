import type { MutableRefObject } from 'react';
import type { ExperimentConfig, WeekSnapshot } from '../sim/index';
import Scene3D, { type PlaybackClock } from './Scene3D';

export interface ViewRun {
  config: ExperimentConfig;
  snapshots: readonly WeekSnapshot[];
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div>
      <span className="text-mute">{label} </span>
      <b className={`text-ink ${tone ?? ''}`}>{value}</b>
    </div>
  );
}

function Hud({ run, week }: { run: ViewRun; week: number }) {
  const i = Math.min(week, run.snapshots.length - 1);
  const s = run.snapshots[i];
  const p = run.config.params;
  const dead = s.collapsed;
  const pct = Math.min(100, (s.backlog / p.collapseThreshold) * 100);
  const alert = s.backlog >= p.rescueTrigger;
  const status = dead
    ? { text: `第 ${s.week} 週倒閉`, cls: 'bg-coral/40' }
    : s.inSurge
      ? { text: `大急單中（+${p.surgeWorkload}/週）`, cls: 'bg-butter/55' }
      : s.rescueActive
        ? { text: '救火隊出動', cls: 'bg-butter/55' }
        : { text: '平常營運', cls: 'bg-blue-soft/20 text-mute' };
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line bg-white px-5 py-3 text-xs tabular-nums sm:grid-cols-4">
      <div className="col-span-2 sm:col-span-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span>
            <span className="text-mute">待辦 backlog </span>
            <b className="text-sm text-ink">{s.backlog.toFixed(1)}</b>
            <span className="text-mute"> / 紅線 {p.collapseThreshold}</span>
          </span>
          <span className={`rounded-full px-3 py-1 font-semibold text-ink ${status.cls}`}>{status.text}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${dead || alert ? 'bg-coral' : 'bg-butter'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Stat label="工作中" value={s.counts.WORKING} />
      <Stat label="茶水間" value={s.counts.RESTING} />
      {s.counts.FAKE_BUSY > 0 ? <Stat label="座位假忙" value={s.counts.FAKE_BUSY} /> : <Stat label="本週新單" value={s.newTasks.toFixed(1)} />}
      <Stat label="過勞" value={s.counts.BURNOUT} />
      <div className="col-span-2 text-mute sm:col-span-4">
        累計產出 {s.totalOutput.toFixed(0)} 件 · 本週產出 {s.output.toFixed(1)}
      </div>
    </div>
  );
}

interface Props {
  runs: ViewRun[];
  clock: MutableRefObject<PlaybackClock>;
  week: number;
}

export default function SplitView({ runs, clock, week }: Props) {
  return (
    <div className={`grid h-full min-h-0 min-w-0 gap-4 ${runs.length > 1 ? 'grid-rows-2 lg:grid-cols-2 lg:grid-rows-1' : ''}`}>
      {runs.map((run, k) => (
        <div
          key={k}
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-[0_6px_24px_rgba(80,100,140,0.08)]"
        >
          <div className="min-h-0 flex-1">
            <Scene3D
              snapshots={run.snapshots}
              clock={clock}
              collapseThreshold={run.config.params.collapseThreshold}
              alertLevel={run.config.params.rescueTrigger}
              label={`${runs.length > 1 ? (k === 0 ? 'A · ' : 'B · ') : ''}${run.config.name}`}
            />
          </div>
          <Hud run={run} week={week} />
        </div>
      ))}
    </div>
  );
}
