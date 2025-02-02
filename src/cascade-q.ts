import { TaskItem, TaskStatus, ThresholdItem, calcConcurrency, CascadeQOptions, TaskHandle, decayCurve } from './types';
import { EventEmitter } from './event-emitter';
import { PriorityQueue } from './priority-queue';
import { DEFAULT_CALC_CONCURRENCY, DEFAULT_MAX_CONCURRENCY, DEFAULT_BASE_DECAY, DEFAULT_DECAY_CURVE, DEFAULT_TASK_TTL, DEFAULT_THRESHOLDS } from './default';

export class CascadeQ extends EventEmitter {
  // 配置选项
  #maxConcurrency: number;
  #baseDecay: number;
  #decayCurve: decayCurve;
  #calcConcurrency: calcConcurrency;
  #taskTTL: number;

  // 队列状态
  #thresholds: ThresholdItem[];
  #priorityQueues: PriorityQueue<TaskItem>[];
  #runningTaskCount = 0;
  #isPaused = false;
  #cleanupInterval?: number;

  constructor(options: CascadeQOptions = {}) {
    super();
    this.#maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.#baseDecay = options.baseDecay ?? DEFAULT_BASE_DECAY;
    this.#decayCurve = options.decayCurve ?? DEFAULT_DECAY_CURVE;
    this.#calcConcurrency = options.calcConcurrency ?? DEFAULT_CALC_CONCURRENCY;
    this.#taskTTL = options.taskTTL ?? DEFAULT_TASK_TTL;

    // 初始化队列
    this.#thresholds = this.#normalizeThresholds(options.thresholds ?? DEFAULT_THRESHOLDS);
    this.#priorityQueues = this.#thresholds.map(
      () => new PriorityQueue<TaskItem>((a, b) => this.#calcEffectivePriority(a) - this.#calcEffectivePriority(b) || a.addedAt - b.addedAt)
    );

    // 启动过期清理
    this.#startExpirationCheck();
  }

  // ================== 公共API =================
  add(task: () => Promise<unknown>, priority?: number): TaskHandle {
    const taskItem: TaskItem = {
      id: Symbol(),
      task,
      basePriority: priority ?? this.#getDefaultPriority(),
      addedAt: Date.now(),
      status: TaskStatus.Pending
    };

    if (taskItem.status !== TaskStatus.Pending) {
      throw new Error('Task must be in pending state');
    }

    this.#enqueueTask(taskItem);
    this.emit('enqueue', taskItem);
    this.#schedule();
    return this.#createTaskHandle(taskItem);
  }

  pause(): void {
    this.#isPaused = true;
  }

  resume(): void {
    if (!this.#isPaused) return;
    this.#isPaused = false;
    this.#schedule();
  }

  cancel(taskId: symbol): boolean {
    for (const queue of this.#priorityQueues) {
      const temp: TaskItem[] = [];
      let found = false;

      while (queue.size > 0) {
        const item = queue.dequeue()!;
        if (item.id === taskId) {
          found = true;
          item.status = TaskStatus.Cancelled;
          this.emit('cancel', item);
        } else {
          temp.push(item);
        }
      }

      temp.forEach(item => queue.enqueue(item));
      if (found) return true;
    }
    return false;
  }

  clear(): void {
    this.#priorityQueues.forEach(q => {
      while (q.size > 0) {
        const task = q.dequeue()!;
        task.status = TaskStatus.Cancelled;
        this.emit('cancel', task);
      }
    });
    this.#runningTaskCount = 0;
  }

  getState() {
    return {
      running: this.#runningTaskCount,
      pending: this.#priorityQueues.reduce((sum, q) => sum + q.size, 0),
      queues: this.#thresholds.map((t, i) => ({
        level: t.level,
        concurrency: t.concurrency,
        pending: this.#priorityQueues[i].size
      }))
    };
  }

  // ================== 核心逻辑 ==================
  #enqueueTask(taskItem: TaskItem): void {
    const effectivePriority = this.#calcEffectivePriority(taskItem);
    const queueIndex = this.#thresholds.findIndex(t => effectivePriority <= t.value);
    const targetQueue = this.#priorityQueues[queueIndex === -1 ? this.#priorityQueues.length - 1 : queueIndex];
    targetQueue.enqueue(taskItem);
  }

  #schedule(): void {
    if (this.#isPaused || this.#runningTaskCount >= this.#maxConcurrency) return;

    while (this.#runningTaskCount < this.#maxConcurrency) {
      const task = this.#dequeueTask();
      if (!task) break;
      this.#executeTask(task);
    }
  }

  #dequeueTask(): TaskItem | undefined {
    for (const threshold of this.#thresholds) {
      if (this.#runningTaskCount < threshold.concurrency) {
        const queue = this.#priorityQueues[this.#thresholds.indexOf(threshold)];
        if (queue.size > 0) return queue.dequeue();
      }
    }
    return undefined;
  }

  async #executeTask(taskItem: TaskItem): Promise<void> {
    taskItem.status = TaskStatus.Running;
    this.#runningTaskCount++;
    this.emit('start', taskItem);

    try {
      await taskItem.task();
      taskItem.status = TaskStatus.Completed;
    } catch (error) {
      console.error('Task execution failed:', error);
    } finally {
      this.#runningTaskCount--;
      this.emit('complete', taskItem);
      this.#schedule();
    }
  }

  // ================== 辅助方法 ==================
  #normalizeThresholds(input: Array<number | ThresholdItem>): ThresholdItem[] {
    const items = input.map(item => (typeof item === 'number' ? { value: item, level: Symbol.for(`Level_${item}`), concurrency: 1 } : item)).sort((a, b) => a.value - b.value);
    const totalLevels = items.length;
    return items.map((item, index) => ({
      ...item,
      concurrency: this.#calcConcurrency(index, {
        max: this.#maxConcurrency,
        totalLevels
      })
    }));
  }

  #calcEffectivePriority(taskItem: TaskItem): number {
    const minutes = (Date.now() - taskItem.addedAt) / 60000;
    return taskItem.basePriority - this.#baseDecay * this.#decayCurve(minutes);
  }

  #createTaskHandle(taskItem: TaskItem): TaskHandle {
    return {
      id: taskItem.id,
      cancel: () => this.cancel(taskItem.id),
      getStatus: () => taskItem.status
    };
  }

  #getDefaultPriority(): number {
    return this.#thresholds[this.#thresholds.length - 1].value + 1;
  }

  // ================== 生命周期管理 ==================
  #startExpirationCheck(): void {
    const checkExpiredTasks = () => {
      const now = Date.now();
      this.#priorityQueues.forEach(queue => {
        const validTasks: TaskItem[] = [];
        while (queue.size > 0) {
          const task = queue.dequeue()!;
          if (now - task.addedAt < this.#taskTTL) {
            validTasks.push(task);
          } else {
            task.status = TaskStatus.Cancelled;
            this.emit('cancel', task);
          }
        }
        validTasks.forEach(t => queue.enqueue(t));
      });
    };

    this.#cleanupInterval = setInterval(
      checkExpiredTasks,
      60_000 // 每分钟检查一次
    ) as unknown as number; // 强制类型转换确保跨环境
  }

  dispose(): void {
    if (this.#cleanupInterval !== undefined) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }
    this.removeAllListeners();
    this.clear();
  }
}
