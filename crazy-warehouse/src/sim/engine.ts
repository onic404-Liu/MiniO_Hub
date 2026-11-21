import { deriveSeed, gaussian, mulberry32, type Rng } from './rng';
import type {
  Agent,
  AgentState,
  AgentView,
  ExperimentConfig,
  RunResult,
  WeekSnapshot,
} from './types';

const ENV_STREAM = 1;
const AGENT_STREAM = 2;

/**
 * Builds the agent roster. Uses its own RNG stream so that the workload /
 * surge timeline (environment stream) is identical across presets.
 */
export function createAgents(config: ExperimentConfig, seed: number): Agent[] {
  const rng = mulberry32(deriveSeed(seed, AGENT_STREAM));
  const { params: p, composition: c, mode } = config;
  const agents: Agent[] = [];
  const stamina = () => p.initialStaminaMin + rng() * (p.initialStaminaMax - p.initialStaminaMin);
  const uniform = ([lo, hi]: readonly [number, number]) => lo + rng() * (hi - lo);
  for (let i = 0; i < c.low; i++) {
    const t = uniform(p.lowThresholdRange);
    agents.push(mk(agents.length, 'LOW_THRESHOLD', mode === 'all_grind' ? 0 : t, stamina()));
  }
  for (let i = 0; i < c.high; i++) {
    agents.push(mk(agents.length, 'HIGH_THRESHOLD', uniform(p.highThresholdRange), stamina()));
  }
  for (let i = 0; i < c.slacker; i++) {
    agents.push(mk(agents.length, 'TRUE_SLACKER', Infinity, stamina()));
  }
  return agents;
}

function mk(id: number, role: Agent['role'], threshold: number, stamina: number): Agent {
  return { id, role, threshold, stamina, state: 'RESTING', burnoutWeeksLeft: 0 };
}

function byDispatchOrder(a: Agent, b: Agent): number {
  if (a.threshold !== b.threshold) return a.threshold < b.threshold ? -1 : 1;
  if (a.stamina !== b.stamina) return b.stamina - a.stamina;
  return a.id - b.id;
}

/** Stateful single-run simulation. Call `step()` once per week. */
export class Simulation {
  readonly config: ExperimentConfig;
  readonly seed: number;
  readonly agents: Agent[];
  week = 0;
  backlog = 0;
  totalOutput = 0;
  collapsed = false;
  collapseWeek: number | null = null;
  surges = 0;
  private surgeWeeksLeft = 0;
  private envRng: Rng;
  private calmRestingSum = 0;
  private calmWeeks = 0;
  private order: Agent[];

  constructor(config: ExperimentConfig, seed: number) {
    this.config = config;
    this.seed = seed >>> 0;
    this.envRng = mulberry32(deriveSeed(this.seed, ENV_STREAM));
    this.agents = createAgents(config, this.seed);
    this.order = this.agents.slice();
  }

  get done(): boolean {
    return this.collapsed || this.week >= this.config.params.weeks;
  }

  /** Advances one week. Returns a snapshot when `snapshot` is true. */
  step(snapshot: true): WeekSnapshot;
  step(snapshot?: false): null;
  step(snapshot = false): WeekSnapshot | null {
    if (this.done) throw new Error('simulation already finished');
    const p = this.config.params;
    const mode = this.config.mode;
    this.week += 1;

    // 1. Arrivals — always consume the same number of env draws per week.
    const surgeRoll = this.envRng();
    const g = gaussian(this.envRng);
    let surgeStarted = false;
    if (this.surgeWeeksLeft === 0 && surgeRoll < p.pSurge) {
      this.surgeWeeksLeft = p.surgeDuration;
      this.surges += 1;
      surgeStarted = true;
    }
    const inSurge = this.surgeWeeksLeft > 0;
    const newTasks = Math.max(0, p.normalMean + p.normalStd * g) + (inSurge ? p.surgeWorkload : 0);
    this.backlog += newTasks;
    if (inSurge) this.surgeWeeksLeft -= 1;

    // 2. Burnout countdown.
    for (const a of this.agents) {
      if (a.state !== 'BURNOUT') continue;
      a.burnoutWeeksLeft -= 1;
      if (a.burnoutWeeksLeft <= 0) {
        a.burnoutWeeksLeft = 0;
        a.state = 'RESTING';
        a.stamina = p.burnoutRecoverStamina;
      }
    }

    // 3. Dispatch.
    //    In RescueBonus crisis weeks (backlog >= rescueTrigger) every HIGH_THRESHOLD
    //    agent is called in and works at rescueThroughput (1.25x); others at 0.75.
    const rescueActive = mode === 'rescue_bonus' && this.backlog >= p.rescueTrigger;
    this.order.sort(byDispatchOrder);
    let remaining = this.backlog;
    let capacity = 0;
    const idleState: AgentState = mode === 'surveillance' ? 'FAKE_BUSY' : 'RESTING';
    for (const a of this.order) {
      if (a.state === 'BURNOUT') continue;
      const rescuer = rescueActive && a.role === 'HIGH_THRESHOLD';
      const tp = rescuer ? p.rescueThroughput : p.throughput;
      let works: boolean;
      if (mode === 'all_grind' || rescuer) works = true;
      else works = remaining > 0 && remaining >= a.threshold;
      if (works) {
        a.state = 'WORKING';
        capacity += tp;
        remaining -= p.allocationPerWorker ?? tp;
      } else {
        a.state = idleState;
      }
    }

    // 4. Output — capped by real backlog (AllGrind fake work beyond it produces nothing).
    const output = Math.min(this.backlog, capacity);
    this.backlog = Math.max(0, this.backlog - output);
    this.totalOutput += output;

    // 5. Stamina & burnout.
    let resting = 0;
    for (const a of this.agents) {
      if (a.state === 'WORKING') a.stamina -= p.staminaDrain;
      else if (a.state === 'FAKE_BUSY') a.stamina -= p.surveillanceDrain;
      else if (a.state === 'RESTING') {
        a.stamina = Math.min(100, a.stamina + p.staminaRecover);
        resting += 1;
      }
      if (a.state !== 'BURNOUT' && a.stamina <= 0) {
        a.state = 'BURNOUT';
        a.stamina = 0;
        a.burnoutWeeksLeft = p.burnoutWeeks;
      }
    }
    if (!inSurge && this.agents.length > 0) {
      this.calmRestingSum += resting / this.agents.length;
      this.calmWeeks += 1;
    }

    // 6. Collapse.
    if (this.backlog > p.collapseThreshold) {
      this.collapsed = true;
      this.collapseWeek = this.week;
    }

    if (!snapshot) return null;
    return this.snapshot(newTasks, output, inSurge, surgeStarted, rescueActive);
  }

  private snapshot(
    newTasks: number,
    output: number,
    inSurge: boolean,
    surgeStarted: boolean,
    rescueActive: boolean,
  ): WeekSnapshot {
    const counts: Record<AgentState, number> = { WORKING: 0, RESTING: 0, FAKE_BUSY: 0, BURNOUT: 0 };
    const agents: AgentView[] = this.agents.map((a) => {
      counts[a.state] += 1;
      return Object.freeze({
        id: a.id,
        role: a.role,
        state: a.state,
        stamina: a.stamina,
        threshold: a.threshold,
      });
    });
    return Object.freeze({
      week: this.week,
      newTasks,
      backlog: this.backlog,
      output,
      totalOutput: this.totalOutput,
      inSurge,
      surgeStarted,
      rescueActive,
      collapsed: this.collapsed,
      counts: Object.freeze(counts),
      agents: Object.freeze(agents),
    });
  }

  /** Initial (week 0) snapshot, before any tick. */
  initialSnapshot(): WeekSnapshot {
    return this.snapshot(0, 0, false, false, false);
  }

  result(): RunResult {
    return {
      seed: this.seed,
      survived: !this.collapsed,
      collapseWeek: this.collapseWeek,
      weeksRun: this.week,
      totalOutput: this.totalOutput,
      surges: this.surges,
      calmRestingShare: this.calmWeeks ? this.calmRestingSum / this.calmWeeks : 0,
    };
  }
}

/** Fast headless run (no snapshots). */
export function runOnce(config: ExperimentConfig, seed: number): RunResult {
  const sim = new Simulation(config, seed);
  while (!sim.done) sim.step();
  return sim.result();
}

/** Full run recording every week's snapshot (for the 3D player). */
export function runWithSnapshots(config: ExperimentConfig, seed: number): {
  result: RunResult;
  snapshots: WeekSnapshot[];
} {
  const sim = new Simulation(config, seed);
  const snapshots = [sim.initialSnapshot()];
  while (!sim.done) snapshots.push(sim.step(true));
  return { result: sim.result(), snapshots };
}
