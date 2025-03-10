/**
 * @author EE_Azura <EE_Azura@outlook.com>
 */

export type CascadeQState = {
  running: number;
  pending: number;
  max: number;
  queues: {
    level: number | string;
    concurrency?: number;
    running: number;
    pending: number;
  }[];
};

/**
 * 任务状态常量对象，用于标识任务的不同运行状态
 */
export const TaskStatus = {
  Pending: 'pending',
  Running: 'running',
  Success: 'success',
  Failed: 'failed',
  Cancelled: 'cancelled'
} as const;

/**
 * 任务状态类型，取自 TaskStatus 常量对象的值
 */
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/**
 * 定义一个任务项，包含任务标识、执行函数、优先级、添加时间以及当前状态
 */
export interface TaskItem {
  id: symbol;
  task: () => Promise<unknown>;
  basePriority: number;
  addedAt: number;
  status: TaskStatus;
}

/**
 * 阈值层级类型，可以是字符串或 symbol
 */
export type ThresholdLevel = string | symbol;

/**
 * 阈值选项，包含阈值数值和阈值级别
 */
export type ThresholdOption = {
  value: number;
  level: ThresholdLevel;
};

/**
 * 阈值项，用于划分不同优先级队列，
 * 包含级别标识、数值阈值和该级别允许的并发数
 */
export interface ThresholdItem {
  level: ThresholdLevel;
  value: number;
  getConcurrency: () => number;
}

/**
 * 计算并发数函数类型，根据当前优先级所在索引和配置计算可以分配的并发数
 */
export type CalcConcurrency = (index: number, state: CascadeQState) => number;

/**
 * CascadeQ 配置选项
 */
export interface CascadeQOptions {
  maxConcurrency?: number;
  baseDecay?: number;
  decayCurve?: DecayCurve;
  calcConcurrency?: CalcConcurrency;
  taskTTL?: number;
  thresholds?: Array<number | ThresholdOption>;
  cleanupInterval?: number;
  priorityCheckInterval?: number;
  priorityDecayInterval?: number;
}

/**
 * 任务处理器接口，包含任务标识、取消任务的方法和获取任务状态的方法
 */
export interface TaskHandle {
  id: symbol;
  cancel: () => boolean;
  getStatus: () => TaskStatus;
  then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
  catch: (onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally?: () => void) => Promise<unknown>;
}

/**
 * 任务队列接口，包含添加任务、取消任务和获取队列长度的方法
 */
export type DecayCurve = (minutes: number) => number;

/**
 * 任务事件类型，用于标识任务队列的不同事件
 */
export type QueueEvent = 'enqueue' | 'start' | 'success' | 'fail' | 'complete' | 'cancel';

/**
 * 事件处理器类型，用于处理任务队列的不同事件
 */
export type EventHandler = (task: TaskItem, error?: Error) => void;
