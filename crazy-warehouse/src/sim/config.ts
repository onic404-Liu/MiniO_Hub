import type { Composition, ExperimentConfig, Mode, PresetId, SimParams } from './types';

/**
 * Calibrated defaults (see README「數值校準」).
 * Spec-fixed: weeks, pSurge, surgeDuration, throughput 0.75 / 0.94,
 * rescueTrigger 20, burnout 2 weeks → 45 stamina, threshold ranges, surveillanceDrain 8.
 * Tuned: normalMean/normalStd (formula missing from spec), surgeWorkload,
 * collapseThreshold, staminaDrain, staminaRecover, allocationPerWorker.
 */
export const DEFAULT_PARAMS: SimParams = {
  weeks: 520,
  normalMean: 50.5,
  normalStd: 6,
  pSurge: 1.5 / 52,
  surgeDuration: 3,
  surgeWorkload: 30,
  collapseThreshold: 64,
  throughput: 0.75,
  allocationPerWorker: 0.46,
  rescueThroughput: 0.94,
  rescueTrigger: 20,
  staminaDrain: 5.9,
  surveillanceDrain: 8,
  staminaRecover: 12,
  burnoutWeeks: 2,
  burnoutRecoverStamina: 45,
  initialStaminaMin: 60,
  initialStaminaMax: 100,
  lowThresholdRange: [0, 10],
  highThresholdRange: [22, 34],
};

interface PresetDef {
  name: string;
  description: string;
  mode: Mode;
  composition: Composition;
}

export const PRESETS: Record<PresetId, PresetDef> = {
  baseline: {
    name: '原版公司（28 法則）',
    description: '80 藍 + 20 黃，標準門檻與茶水間規則',
    mode: 'normal',
    composition: { low: 80, high: 20, slacker: 0 },
  },
  fire_slackers: {
    name: '開除摸魚組',
    description: '80 藍，直接移除 20 隻高門檻員工',
    mode: 'normal',
    composition: { low: 80, high: 0, slacker: 0 },
  },
  all_grind: {
    name: '全員捲王',
    description: '100 藍，拆除茶水間，全員門檻歸零、每週強制滿載',
    mode: 'all_grind',
    composition: { low: 100, high: 0, slacker: 0 },
  },
  true_slackers: {
    name: '真擺爛公司',
    description: '80 藍 + 20 紫，危機也不動',
    mode: 'normal',
    composition: { low: 80, high: 0, slacker: 20 },
  },
  surveillance: {
    name: '裝監控盯梢',
    description: '80 藍 + 20 黃，禁止進茶水間，沒事時假忙扣體力',
    mode: 'surveillance',
    composition: { low: 80, high: 20, slacker: 0 },
  },
  rescue_bonus: {
    name: '留餘裕＋救火獎金',
    description: '80 藍 + 20 黃，紅燈時救火隊即時出動且效率 1.25x',
    mode: 'rescue_bonus',
    composition: { low: 80, high: 20, slacker: 0 },
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function makeConfig(id: PresetId, overrides: Partial<SimParams> = {}): ExperimentConfig {
  const p = PRESETS[id];
  return { id, ...p, params: { ...DEFAULT_PARAMS, ...overrides } };
}

export const SWEEP_RATIOS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as const;

/** Sweep config: 100 agents, `ratio` of them HIGH_THRESHOLD, normal mode. */
export function makeSweepConfig(ratio: number, overrides: Partial<SimParams> = {}): ExperimentConfig {
  const high = Math.round(100 * ratio);
  return {
    id: `sweep_${Math.round(ratio * 100)}`,
    name: `備用人力 ${Math.round(ratio * 100)}%`,
    description: `${100 - high} 藍 + ${high} 黃`,
    mode: 'normal',
    composition: { low: 100 - high, high, slacker: 0 },
    params: { ...DEFAULT_PARAMS, ...overrides },
  };
}
