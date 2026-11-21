import { makeConfig, makeSweepConfig, PRESET_IDS, SWEEP_RATIOS } from './config';
import { runOnce } from './engine';
import type { ExperimentConfig, PresetId, RunResult, SimParams } from './types';

export interface McSummary {
  id: string;
  name: string;
  runs: number;
  survivalRate: number;
  meanTotalOutput: number;
  meanCollapseWeek: number | null;
  meanCalmRestingShare: number;
  meanSurges: number;
}

/** Seed for run i — shared across presets so every group sees the same timelines. */
export function runSeed(baseSeed: number, i: number): number {
  return (baseSeed + Math.imul(i, 0x9e3779b1)) >>> 0;
}

export function monteCarlo(config: ExperimentConfig, runs: number, baseSeed = 20240520): McSummary {
  let survived = 0;
  let output = 0;
  let collapseSum = 0;
  let collapses = 0;
  let resting = 0;
  let surges = 0;
  for (let i = 0; i < runs; i++) {
    const r: RunResult = runOnce(config, runSeed(baseSeed, i));
    if (r.survived) survived++;
    else {
      collapses++;
      collapseSum += r.collapseWeek ?? 0;
    }
    output += r.totalOutput;
    resting += r.calmRestingShare;
    surges += r.surges;
  }
  return {
    id: config.id,
    name: config.name,
    runs,
    survivalRate: survived / runs,
    meanTotalOutput: output / runs,
    meanCollapseWeek: collapses ? collapseSum / collapses : null,
    meanCalmRestingShare: resting / runs,
    meanSurges: surges / runs,
  };
}

export function runAllPresets(
  runs: number,
  baseSeed?: number,
  overrides: Partial<SimParams> = {},
  ids: readonly PresetId[] = PRESET_IDS,
): McSummary[] {
  return ids.map((id) => monteCarlo(makeConfig(id, overrides), runs, baseSeed));
}

export interface SweepPoint {
  ratio: number;
  survivalRate: number;
  meanTotalOutput: number;
}

export function runSweep(
  runs: number,
  baseSeed?: number,
  overrides: Partial<SimParams> = {},
  ratios: readonly number[] = SWEEP_RATIOS,
): SweepPoint[] {
  return ratios.map((ratio) => {
    const s = monteCarlo(makeSweepConfig(ratio, overrides), runs, baseSeed);
    return { ratio, survivalRate: s.survivalRate, meanTotalOutput: s.meanTotalOutput };
  });
}
