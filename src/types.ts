export const TaskStatus = {
  Pending: 'pending',
  Running: 'running',
  Completed: 'completed',
  Cancelled: 'cancelled'
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export interface TaskItem {
  id: symbol;
  task: () => Promise<unknown>;
  basePriority: number;
  addedAt: number;
  status: TaskStatus;
}

type ThresholdLevel = string | symbol;

export interface ThresholdItem {
  level: ThresholdLevel;
  value: number;
  concurrency: number;
}

export type calcConcurrency = (index: number, context: { max: number; totalLevels: number }) => number;

export interface CascadeQOptions {
  maxConcurrency?: number;
  baseDecay?: number;
  decayCurve?: (minutes: number) => number;
  thresholds?: Array<number | ThresholdItem>;
  taskTTL?: number;
  calcConcurrency?: calcConcurrency;
}

export interface TaskHandle {
  id: symbol;
  cancel: () => boolean;
  getStatus: () => TaskStatus;
}

export type decayCurve = (minutes: number) => number;

export type QueueEvent = 'enqueue' | 'start' | 'complete' | 'cancel';

export type EventHandler = (task: TaskItem) => void;
