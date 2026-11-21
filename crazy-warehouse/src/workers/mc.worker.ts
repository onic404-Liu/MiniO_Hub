/// <reference lib="webworker" />
import { makeConfig, makeSweepConfig, monteCarlo, PRESET_IDS, SWEEP_RATIOS } from '../sim/index';
import type { McSummary } from '../sim/index';

export type McRequest = { runs: number; seed: number };
export type McMessage =
  | { type: 'preset'; summary: McSummary; done: number; total: number }
  | { type: 'sweep'; ratio: number; survivalRate: number; done: number; total: number }
  | { type: 'finished'; ms: number };

const post = (m: McMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<McRequest>) => {
  const { runs, seed } = e.data;
  const t0 = performance.now();
  const total = PRESET_IDS.length + SWEEP_RATIOS.length;
  let done = 0;
  for (const id of PRESET_IDS) {
    const summary = monteCarlo(makeConfig(id), runs, seed);
    post({ type: 'preset', summary, done: ++done, total });
  }
  for (const ratio of SWEEP_RATIOS) {
    const s = monteCarlo(makeSweepConfig(ratio), runs, seed);
    post({ type: 'sweep', ratio, survivalRate: s.survivalRate, done: ++done, total });
  }
  post({ type: 'finished', ms: performance.now() - t0 });
};
