import { CascadeQOptions, TaskItem, TaskStatus, ThresholdsItem } from './types';

const DEFAULT_LEVELS_NAME = ['critical', 'high', 'normal'];
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_BASE_DECAY = 0.1;
const DEFAULT_THRESHOLDS = [0, 5, 10];
const DEFAULT_CONCURRENCY = 0.3;

export class CascadeQ {
  // 基础配置
  #maxConcurrency: number;
  #baseDecay: number;
  #thresholds: ThresholdsItem[];
  // 队列
  #queues: TaskItem[][];
  // 状态
  #activeCount: number = 0;
  #isPaused: boolean = false;

  constructor(options: CascadeQOptions = {}) {
    this.#maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.#baseDecay = options.baseDecay ?? DEFAULT_BASE_DECAY;
    this.#thresholds = this.#normalizeThresholds(
      options.thresholds ?? DEFAULT_THRESHOLDS
    );
    this.#queues = this.#thresholds.map(() => []);
  }

  // ================== 公开方法 ==================
  add(task: () => Promise<unknown>, priority = this.#getDefaultPriority()) {
    const taskItem = {
      id: Symbol(),
      task,
      basePriority: priority,
      addedAt: Date.now(),
      status: 'pending' as TaskStatus
    };

    this.#insertToQueue(taskItem);
    this.#schedule();
    return this.#createTaskHandle(taskItem);
  }

  pause() {
    this.#isPaused = true;
  }

  resume() {
    this.#isPaused = false;
    this.#schedule();
  }

  cancel(taskId: symbol) {
    for (const queue of this.#queues) {
      const index = queue.findIndex(t => t.id === taskId);
      if (index > -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  getState() {
    return {
      pending: this.#queues.reduce((sum, q) => sum + q.length, 0),
      running: this.#activeCount,
      queues: this.#thresholds.map((t, i) => ({
        level: t.level,
        pending: this.#queues[i].length
      }))
    };
  }

  clear(): void {
    this.#queues = this.#thresholds.map(() => []);
    this.#activeCount = 0;
  }
  // ================== 核心方法 ==================
  #insertToQueue(taskItem: TaskItem) {
    const effectivePriority = this.#calcEffectivePriority(taskItem);
    const queueIndex = this.#thresholds.findIndex(
      t => effectivePriority <= t.value
    );

    const targetQueue =
      this.#queues[queueIndex === -1 ? this.#queues.length - 1 : queueIndex];

    // 保持队列有序：优先级降序 + 时间升序
    let index = targetQueue.findIndex(
      t =>
        this.#calcEffectivePriority(t) < effectivePriority ||
        (this.#calcEffectivePriority(t) === effectivePriority &&
          t.addedAt > taskItem.addedAt)
    );

    if (index === -1) index = targetQueue.length;
    targetQueue.splice(index, 0, taskItem);
  }

  #schedule() {
    if (this.#isPaused) return;
    if (this.#activeCount >= this.#maxConcurrency) return;

    while (this.#activeCount < this.#maxConcurrency) {
      const task = this.#dequeueTask();
      if (!task) break;
      this.#executeTask(task);
    }
  }

  #dequeueTask() {
    const availableLevels = this.#thresholds
      .filter(t => this.#activeCount < t.concurrency)
      .map(t => t.value)
      .sort((a, b) => a - b);

    for (const level of availableLevels) {
      const queueIndex = this.#thresholds.findIndex(t => t.value === level);
      if (this.#queues[queueIndex].length > 0) {
        return this.#queues[queueIndex].shift();
      }
    }
    return null;
  }

  async #executeTask(taskItem: TaskItem) {
    taskItem.status = 'running';
    this.#activeCount++;

    const cleanup = () => {
      this.#activeCount--;
      this.#schedule();
    };
    try {
      await taskItem.task();
      cleanup();
    } catch (error) {
      console.error(error);
      cleanup();
    }
  }

  // ================== 辅助方法 ==================
  #normalizeThresholds(input: number[] | ThresholdsItem[]): ThresholdsItem[] {
    // 处理number数组简写
    if (Array.isArray(input) && input.every(Number.isInteger)) {
      return (input as number[])
        .sort((a, b) => a - b)
        .map((value, i) => ({
          level: DEFAULT_LEVELS_NAME[i] || `level_${i}`,
          value,
          concurrency: Math.floor(
            this.#maxConcurrency * DEFAULT_CONCURRENCY ** i
          )
        }));
    }

    // 处理完整对象配置
    return (input as ThresholdsItem[])
      .map(t => ({
        level: t.level || `level_${t.value}`,
        value: typeof t === 'number' ? t : t.value,
        // TODO 优化并发数计算
        concurrency: t.concurrency || 1
      }))
      .sort((a, b) => a.value - b.value);
  }

  #calcEffectivePriority(taskItem: TaskItem) {
    const minutesElapsed = (Date.now() - taskItem.addedAt) / 60000;
    return taskItem.basePriority - Math.floor(minutesElapsed * this.#baseDecay);
  }

  #createTaskHandle(taskItem: TaskItem) {
    return {
      id: taskItem.id,
      cancel: () => this.cancel(taskItem.id),
      getStatus: () => taskItem.status
    };
  }

  #getDefaultPriority() {
    return this.#thresholds[this.#thresholds.length - 1].value + 1;
  }
}
