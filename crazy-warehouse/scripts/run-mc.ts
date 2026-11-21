import { runAllPresets, runSweep } from '../src/sim/index';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'] as const;
  }),
);
const runs = Number(args.get('runs') ?? 1000);
const seed = Number(args.get('seed') ?? 20240520);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);

const t0 = performance.now();
const presets = runAllPresets(runs, seed);
const t1 = performance.now();
console.log(`\n== 6 組 Preset × ${runs} 次 × 520 週（seed=${seed}）  ${(t1 - t0).toFixed(0)} ms ==`);
console.log('preset          存活率   十年總產出  茶水間占比  平均倒閉週  平均急單數');
for (const s of presets) {
  console.log(
    `${s.id.padEnd(15)} ${pct(s.survivalRate)}  ${s.meanTotalOutput.toFixed(0).padStart(10)}  ${pct(
      s.meanCalmRestingShare,
    )}    ${(s.meanCollapseWeek?.toFixed(0) ?? '-').padStart(8)}  ${s.meanSurges.toFixed(1).padStart(9)}`,
  );
}

if (args.get('sweep') !== 'false') {
  const t2 = performance.now();
  const sweep = runSweep(runs, seed);
  console.log(`\n== 參數掃描：備用人力比例 vs 10 年存活率  ${(performance.now() - t2).toFixed(0)} ms ==`);
  for (const p of sweep) {
    const bar = '█'.repeat(Math.round(p.survivalRate * 40));
    console.log(`${`${Math.round(p.ratio * 100)}%`.padStart(4)} ${pct(p.survivalRate)} ${bar}`);
  }
}
