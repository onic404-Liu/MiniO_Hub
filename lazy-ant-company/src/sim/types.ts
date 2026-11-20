export type Role = 'LOW_THRESHOLD' | 'HIGH_THRESHOLD' | 'TRUE_SLACKER';

/**
 * WORKING   – on real (or, in AllGrind, fake) tasks, in the office
 * RESTING   – in the tea room, recovering stamina
 * FAKE_BUSY – Surveillance mode: stuck at desk pretending, drains stamina
 * BURNOUT   – in the recovery ward
 */
export type AgentState = 'WORKING' | 'RESTING' | 'FAKE_BUSY' | 'BURNOUT';

export type Mode = 'normal' | 'all_grind' | 'surveillance' | 'rescue_bonus';

export type PresetId =
  | 'baseline'
  | 'fire_slackers'
  | 'all_grind'
  | 'true_slackers'
  | 'surveillance'
  | 'rescue_bonus';

export interface Agent {
  id: number;
  role: Role;
  threshold: number;
  stamina: number;
  state: AgentState;
  burnoutWeeksLeft: number;
}

export interface SimParams {
  weeks: number;
  normalMean: number;
  normalStd: number;
  pSurge: number;
  surgeDuration: number;
  surgeWorkload: number;
  collapseThreshold: number;
  throughput: number;
  /**
   * How much one assigned worker reduces the 'remaining unallocated backlog'
   * seen by agents later in the dispatch queue. null = equal to throughput.
   */
  allocationPerWorker: number | null;
  rescueThroughput: number;
  rescueTrigger: number;
  staminaDrain: number;
  surveillanceDrain: number;
  staminaRecover: number;
  burnoutWeeks: number;
  burnoutRecoverStamina: number;
  initialStaminaMin: number;
  initialStaminaMax: number;
  lowThresholdRange: readonly [number, number];
  highThresholdRange: readonly [number, number];
}

export interface Composition {
  low: number;
  high: number;
  slacker: number;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  mode: Mode;
  composition: Composition;
  params: SimParams;
}

export interface AgentView {
  readonly id: number;
  readonly role: Role;
  readonly state: AgentState;
  readonly stamina: number;
  readonly threshold: number;
}

/** Immutable per-week output consumed by the 3D scene. */
export interface WeekSnapshot {
  readonly week: number;
  readonly newTasks: number;
  readonly backlog: number;
  readonly output: number;
  readonly totalOutput: number;
  readonly inSurge: boolean;
  readonly surgeStarted: boolean;
  readonly rescueActive: boolean;
  readonly collapsed: boolean;
  readonly counts: Readonly<Record<AgentState, number>>;
  readonly agents: readonly AgentView[];
}

export interface RunResult {
  seed: number;
  survived: boolean;
  collapseWeek: number | null;
  weeksRun: number;
  totalOutput: number;
  surges: number;
  /** Mean share of agents RESTING in non-surge weeks. */
  calmRestingShare: number;
}
