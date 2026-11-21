import { describe, expect, it } from 'vitest';
import {
  createAgents,
  makeConfig,
  mulberry32,
  PRESET_IDS,
  runOnce,
  runWithSnapshots,
  Simulation,
} from '../src/sim/index';

describe('Mulberry32', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs[0]).not.toBe(c());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe('Seed reproducibility', () => {
  it('same seed → identical run results for every preset', () => {
    for (const id of PRESET_IDS) {
      const cfg = makeConfig(id);
      expect(runOnce(cfg, 777)).toEqual(runOnce(cfg, 777));
    }
  });

  it('same seed → identical snapshot timelines', () => {
    const cfg = makeConfig('baseline');
    const a = runWithSnapshots(cfg, 9).snapshots;
    const b = runWithSnapshots(cfg, 9).snapshots;
    expect(a).toEqual(b);
  });

  it('same seed → identical workload & surge timeline across presets', () => {
    const timeline = (id: (typeof PRESET_IDS)[number]) => {
      const sim = new Simulation(makeConfig(id, { collapseThreshold: Infinity }), 1234);
      const out: [number, boolean][] = [];
      while (!sim.done) {
        const s = sim.step(true);
        out.push([s.newTasks, s.inSurge]);
      }
      return out;
    };
    const ref = timeline('baseline');
    expect(ref.some(([, surge]) => surge)).toBe(true);
    for (const id of PRESET_IDS) expect(timeline(id)).toEqual(ref);
  });

  it('does not use Math.random inside the engine', () => {
    const orig = Math.random;
    Math.random = () => {
      throw new Error('Math.random used in sim');
    };
    try {
      for (const id of PRESET_IDS) runOnce(makeConfig(id), 5);
    } finally {
      Math.random = orig;
    }
  });
});

describe('Agent roster & rules', () => {
  it('builds compositions and threshold ranges per spec', () => {
    const base = createAgents(makeConfig('baseline'), 1);
    expect(base.filter((a) => a.role === 'LOW_THRESHOLD')).toHaveLength(80);
    expect(base.filter((a) => a.role === 'HIGH_THRESHOLD')).toHaveLength(20);
    for (const a of base) {
      if (a.role === 'LOW_THRESHOLD') expect(a.threshold).toBeGreaterThanOrEqual(0), expect(a.threshold).toBeLessThanOrEqual(10);
      else expect(a.threshold).toBeGreaterThanOrEqual(22), expect(a.threshold).toBeLessThanOrEqual(34);
    }
    expect(createAgents(makeConfig('fire_slackers'), 1)).toHaveLength(80);
    expect(createAgents(makeConfig('all_grind'), 1).every((a) => a.threshold === 0)).toBe(true);
    const ts = createAgents(makeConfig('true_slackers'), 1);
    expect(ts.filter((a) => a.threshold === Infinity)).toHaveLength(20);
  });

  it('true slackers never work; all_grind has nobody resting', () => {
    const ts = runWithSnapshots(makeConfig('true_slackers'), 3).snapshots;
    for (const s of ts)
      for (const a of s.agents) if (a.role === 'TRUE_SLACKER') expect(a.state).not.toBe('WORKING');
    const ag = runWithSnapshots(makeConfig('all_grind'), 3).snapshots.slice(1);
    for (const s of ag) expect(s.counts.RESTING).toBe(0);
  });

  it('surveillance has no tea-room resting (only FAKE_BUSY)', () => {
    const sv = runWithSnapshots(makeConfig('surveillance'), 3).snapshots.slice(1);
    for (const s of sv) expect(s.counts.RESTING).toBe(0);
    expect(sv.some((s) => s.counts.FAKE_BUSY > 0)).toBe(true);
  });

  it('collapse stops the run when backlog exceeds the red line', () => {
    const r = runWithSnapshots(makeConfig('fire_slackers'), 11);
    if (!r.result.survived) {
      const last = r.snapshots[r.snapshots.length - 1];
      expect(last.collapsed).toBe(true);
      expect(last.backlog).toBeGreaterThan(makeConfig('fire_slackers').params.collapseThreshold);
      expect(last.week).toBe(r.result.collapseWeek);
    }
  });

  it('snapshots are frozen (immutable)', () => {
    const { snapshots } = runWithSnapshots(makeConfig('baseline'), 2);
    expect(Object.isFrozen(snapshots[1])).toBe(true);
    expect(Object.isFrozen(snapshots[1].agents)).toBe(true);
    expect(Object.isFrozen(snapshots[1].agents[0])).toBe(true);
  });
});
