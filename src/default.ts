/**
 * @author EE_Azura <EE_Azura@outlook.com>
 */

import { CalcConcurrency, DecayCurve, ThresholdItem, CascadeQState } from './types';

/**
 * 默认计算并发数函数。
 * 优先分配给有任务的队列：只有当队列中有等待任务时，才分配并发数
 * 按优先级分配：优先级高的队列优先分配更多的并发数
 * 动态调整：根据实际的任务数量和最大并发数动态调整分配，最小单位为1
 *
 * @param {number} index 当前级别的索引，从0开始，索引越小优先级越高
 * @param {object} state 当前状态
 * @param {number} state.max 最大并发数
 * @param {number} state.running 当前运行中的任务数
 * @param {number} state.pending 当前等待中的任务数
 * @param {Array<ThresholdItem>} state.queues 队列状态
 * @param {number} state.queues.level 队列级别
 * @param {number} state.queues.running 队列运行中的任务数
 * @param {number} state.queues.pending 队列等待中的任务数
 * @returns {number} 当前级别可以分配的并发数
 */
export const DEFAULT_CALC_CONCURRENCY: CalcConcurrency = (index, { max, pending, queues }: CascadeQState) => {
  const totalLevels = queues.length;
  const pendingTasks = queues.map(queue => queue.pending);
  const totalPending = pending; // 总等待任务数

  if (totalPending === 0) {
    return 0; // 没有等待任务时，不分配并发数
  }

  const levelPending = pendingTasks[index];
  const levelWeight = (totalLevels - index) / totalLevels;
  const levelShare = Math.floor((max * levelWeight * levelPending) / totalPending);

  return Math.max(Math.min(levelShare, levelPending), 1); // 分配的并发数不能超过等待任务数, 且至少为1
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

// 默认清理周期（单位：毫秒）
export const DEFAULT_CLEANUP_CD = 60_000;

// 优先级检查周期（单位：毫秒）
export const PRIORITY_CHECK_CD = 10_000;
