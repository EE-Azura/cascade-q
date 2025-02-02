export interface CascadeQOptions {
  maxConcurrency?: number;
  baseDecay?: number;
  thresholds?: number[];
}

export type TaskStatus = 'pending' | 'running' | 'done' | 'cancelled';

export interface TaskItem {
  id: symbol;
  task: () => Promise<unknown>;
  basePriority: number;
  addedAt: number;
  status: TaskStatus;
}

export interface ThresholdsItem {
  level: string | string[];
  value: number;
  concurrency: number;
}

export type QueueEvent = 'enqueue' | 'start' | 'complete' | 'cancel';

export type EventHandler = (task: TaskItem) => void;
