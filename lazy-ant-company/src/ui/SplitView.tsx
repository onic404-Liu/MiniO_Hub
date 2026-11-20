import type { MutableRefObject } from 'react';
import type { ExperimentConfig, WeekSnapshot } from '../sim/index';
import Scene3D, { type PlaybackClock } from './Scene3D';

export interface ViewRun {
  config: ExperimentConfig;
  snapshots: readonly WeekSnapshot[];
}

function Hud({ run, week }: { run: ViewRun; week: number }) {
  const i = Math.min(week, run.snapshots.length - 1);
  const s = run.snapshots[i];
  const p = run.config.params;
  const dead = s.collapsed;
  const pct = Math.min(100, (s.backlog / p.collapseThreshold) * 100);
  const alert = s.backlog >= p.rescueTrigger;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-700 bg-slate-900/90 px-3 py-2 text-xs tabular-nums sm:grid-cols-4">
      <div className="col-span-2 sm:col-span-4">
        <div className="mb-1 flex justify-between">
          <span>
            待辦 backlog <b className={dead ? 'text-red-400' : alert ? 'text-amber-300' : 'text-white'}>{s.backlog.toFixed(1)}</b>
            <span className="text-slate-500"> / 紅線 {p.collapseThreshold}</span>
          </span>
          <span>
            {dead ? (
              <b className="text-red-400">💀 第 {s.week} 週倒閉</b>
            ) : s.inSurge ? (
              <b className="text-orange-300">⚡ 大急單中（+{p.surgeWorkload}/週）</b>
            ) : s.rescueActive ? (
              <b className="text-amber-300">🚒 救火隊出動</b>
            ) : (
              <span className="text-slate-400">平常營運</span>
            )}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-slate-700">
          <div
            className={`h-full ${dead ? 'bg-red-500' : alert ? 'bg-amber-400' : 'bg-sky-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div>工作中 <b>{s.counts.WORKING}</b></div>
      <div>茶水間 <b className="text-emerald-300">{s.counts.RESTING}</b></div>
      <div>{s.counts.FAKE_BUSY > 0 ? <>座位假忙 <b className="text-slate-300">{s.counts.FAKE_BUSY}</b></> : <>本週新單 <b>{s.newTasks.toFixed(1)}</b></>}</div>
      <div>過勞 <b className="text-red-300">{s.counts.BURNOUT}</b></div>
      <div className="col-span-2 sm:col-span-4 text-slate-400">累計產出 {s.totalOutput.toFixed(0)} 件 · 本週產出 {s.output.toFixed(1)}</div>
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
    <div className={`grid h-full min-h-0 min-w-0 gap-px bg-slate-700 ${runs.length > 1 ? 'grid-rows-2 lg:grid-cols-2 lg:grid-rows-1' : ''}`}>
      {runs.map((run, k) => (
        <div key={k} className="flex min-h-0 min-w-0 flex-col bg-slate-950">
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
