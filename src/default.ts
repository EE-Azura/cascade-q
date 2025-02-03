/**
 * @author EE_Azura <EE_Azura@outlook.com>
 */

import { CalcConcurrency, DecayCurve, ThresholdItem } from './types';

/**
 * 默认计算并发数函数。
 *
 * 当仅有两个优先级时，分配 80% 的并发数给高优先级任务，余下 20% 给低优先级任务；
 * 否则采用线性分配方案，根据各个优先级对应的位置计算分配比例。
 *
 * @param {number} index 当前级别的索引，从0开始，索引越小优先级越高
 * @param {{ max: number, totalLevels: number }} options 配置对象
 * @param {number} options.max 最大并发数
 * @param {number} options.totalLevels 所有优先级的总数
 * @returns {number} 当前级别可以分配的并发数
 */
export const DEFAULT_CALC_CONCURRENCY: CalcConcurrency = (index, { max, totalLevels }) => {
  if (totalLevels === 2) {
    return index === 0 ? Math.floor(max * 0.8) : max - Math.floor(max * 0.8);
  }
  return Math.floor((max * (totalLevels - index)) / totalLevels);
};

// 默认最大并发数
export const DEFAULT_MAX_CONCURRENCY: number = 10;

// 降低基础衰减，HTTP请求场景不需要快速衰减
export const DEFAULT_BASE_DECAY: number = 0.5;

// 保持衰减曲线为线性变化
export const DEFAULT_DECAY_CURVE: DecayCurve = m => m;

// 任务生存时长（单位：毫秒）
export const DEFAULT_TASK_TTL: number = 600_000; // 600秒

// 根据实际场景，仅需两级优先级：业务请求（高优先级）与日志请求（低优先级）
export const DEFAULT_THRESHOLDS: Array<number | ThresholdItem> = [0, 10];

// 优先级检查周期（单位：毫秒）
export const PRIORITY_CHECK_CD = 10_000;
