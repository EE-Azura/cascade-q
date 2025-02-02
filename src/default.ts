import { CalcConcurrency, DecayCurve, ThresholdItem } from './types';

export const DEFAULT_CALC_CONCURRENCY: CalcConcurrency = (index, { max, totalLevels }) => Math.floor((max * (totalLevels - index)) / totalLevels);

export const DEFAULT_MAX_CONCURRENCY: number = 4;

export const DEFAULT_BASE_DECAY: number = 0.1;

export const DEFAULT_DECAY_CURVE: DecayCurve = m => m;

export const DEFAULT_TASK_TTL: number = 3600_000; // 默认1小时

export const DEFAULT_THRESHOLDS: Array<number | ThresholdItem> = [0, 5, 10];
