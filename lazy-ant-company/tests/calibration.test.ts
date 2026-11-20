/**
 * Qualitative calibration: the orderings & shape from SPEC §5 that the current
 * model reproduces. The exact numeric bands live in tests/targets (npm run test:targets).
 */
import { describe, expect, it } from 'vitest';
import { runAllPresets, runSweep, type McSummary } from '../src/sim/index';

const RUNS = 1000;
const presets = Object.fromEntries(runAllPresets(RUNS).map((s) => [s.id, s])) as Record<string, McSummary>;
const sweep = runSweep(RUNS);
const sr = (id: string) => presets[id].survivalRate;

describe(`Qualitative calibration (${RUNS} runs × 520 weeks)`, () => {
  it('rescue_bonus has the highest survival and the highest mean 10-year output', () => {
    for (const s of Object.values(presets)) {
      if (s.id === 'rescue_bonus') continue;
      expect(sr('rescue_bonus')).toBeGreaterThan(s.survivalRate + 0.1);
      expect(presets.rescue_bonus.meanTotalOutput).toBeGreaterThan(s.meanTotalOutput);
    }
  });

  it('baseline is second, clearly above all_grind / surveillance', () => {
    for (const id of ['all_grind', 'surveillance', 'fire_slackers', 'true_slackers'])
      expect(sr('baseline')).toBeGreaterThan(sr(id) + 0.15);
  });

  it('all_grind and surveillance crash into the 10–30% band', () => {
    for (const id of ['all_grind', 'surveillance']) {
      expect(sr(id)).toBeGreaterThanOrEqual(0.1);
      expect(sr(id)).toBeLessThanOrEqual(0.3);
    }
  });

  it('fire_slackers and true_slackers are nearly wiped out (≤5%)', () => {
    for (const id of ['fire_slackers', 'true_slackers']) expect(sr(id)).toBeLessThanOrEqual(0.05);
  });

  it('baseline keeps a visible tea-room crowd on calm weeks (high-threshold staff resting)', () => {
    expect(presets.baseline.meanCalmRestingShare).toBeGreaterThan(0.15);
    expect(presets.all_grind.meanCalmRestingShare).toBe(0);
    expect(presets.surveillance.meanCalmRestingShare).toBe(0);
  });

  it('sweep is an inverted U peaking at 20–30% reserve staff', () => {
    const at = (r: number) => sweep.find((p) => Math.abs(p.ratio - r) < 1e-9)!.survivalRate;
    const best = sweep.reduce((a, b) => (b.survivalRate > a.survivalRate ? b : a));
    expect(best.ratio).toBeGreaterThanOrEqual(0.2);
    expect(best.ratio).toBeLessThanOrEqual(0.3);
    const peak = best.survivalRate;
    expect(at(0)).toBeLessThan(peak - 0.05);
    expect(at(0.1)).toBeLessThan(peak);
    expect(at(0.4)).toBeLessThan(peak);
    expect(at(0.5)).toBeLessThan(peak - 0.05);
    expect(at(0.6)).toBeLessThan(peak - 0.05);
  });
});
