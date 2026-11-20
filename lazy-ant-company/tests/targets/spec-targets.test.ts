/**
 * SPEC §5 numeric target bands, verbatim. Run with: npm run test:targets
 * Not all of these pass with the current model — see README「校準結果」.
 */
import { describe, expect, it } from 'vitest';
import { runAllPresets, runSweep, type McSummary } from '../../src/sim/index';

const RUNS = 1000;
const presets = Object.fromEntries(runAllPresets(RUNS).map((s) => [s.id, s])) as Record<string, McSummary>;
const sweep = runSweep(RUNS);
const sr = (id: string) => presets[id].survivalRate;

describe(`Calibration targets (${RUNS} runs × 520 weeks)`, () => {
  it('1. rescue_bonus survives most (80–95%) and has the highest mean output', () => {
    expect(sr('rescue_bonus')).toBeGreaterThanOrEqual(0.8);
    expect(sr('rescue_bonus')).toBeLessThanOrEqual(0.95);
    for (const s of Object.values(presets)) {
      if (s.id === 'rescue_bonus') continue;
      expect(sr('rescue_bonus')).toBeGreaterThan(s.survivalRate);
      expect(presets.rescue_bonus.meanTotalOutput).toBeGreaterThan(s.meanTotalOutput);
    }
  });

  it('2. baseline is second (65–80%) with 20–30% in the tea room on calm weeks', () => {
    expect(sr('baseline')).toBeGreaterThanOrEqual(0.65);
    expect(sr('baseline')).toBeLessThanOrEqual(0.8);
    for (const id of ['fire_slackers', 'all_grind', 'true_slackers', 'surveillance'])
      expect(sr('baseline')).toBeGreaterThan(sr(id));
    expect(presets.baseline.meanCalmRestingShare).toBeGreaterThanOrEqual(0.2);
    expect(presets.baseline.meanCalmRestingShare).toBeLessThanOrEqual(0.3);
  });

  it('3. all_grind and surveillance crash to 10–30%', () => {
    for (const id of ['all_grind', 'surveillance']) {
      expect(sr(id)).toBeGreaterThanOrEqual(0.1);
      expect(sr(id)).toBeLessThanOrEqual(0.3);
    }
  });

  it('4. fire_slackers and true_slackers are nearly wiped out (0–5%)', () => {
    for (const id of ['fire_slackers', 'true_slackers']) expect(sr(id)).toBeLessThanOrEqual(0.05);
  });

  it('5. sweep is an inverted U peaking at 20–30%', () => {
    const at = (r: number) => sweep.find((p) => Math.abs(p.ratio - r) < 1e-9)!.survivalRate;
    const peakRatio = sweep.reduce((a, b) => (b.survivalRate > a.survivalRate ? b : a)).ratio;
    expect(peakRatio).toBeGreaterThanOrEqual(0.2);
    expect(peakRatio).toBeLessThanOrEqual(0.3);
    const peak = Math.max(at(0.2), at(0.3));
    const clearly = 0.1;
    expect(at(0)).toBeLessThan(peak - clearly);
    expect(at(0.5)).toBeLessThan(peak - clearly);
    expect(at(0.6)).toBeLessThan(peak - clearly);
  });
});
