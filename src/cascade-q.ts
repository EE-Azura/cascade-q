/**
 * @author EE_Azura <EE_Azura@outlook.com>
 */

/**
 * CascadeQ - 多优先级任务调度器
 */
import { TaskItem, TaskStatus, ThresholdItem, CalcConcurrency, CascadeQOptions, TaskHandle, DecayCurve } from './types';
import { EventEmitter } from './event-emitter';
import { PriorityQueue } from './priority-queue';
import { DEFAULT_CALC_CONCURRENCY, DEFAULT_MAX_CONCURRENCY, DEFAULT_BASE_DECAY, DEFAULT_DECAY_CURVE, DEFAULT_TASK_TTL, DEFAULT_THRESHOLDS } from './default';

export class CascadeQ extends EventEmitter {
  // 配置选项（只读属性）
  readonly #maxConcurrency: number;
  readonly #baseDecay: number;
  readonly #decayCurve: DecayCurve;
  readonly #calcConcurrency: CalcConcurrency;
  readonly #taskTTL: number;

  // 队列状态
  #thresholds: ThresholdItem[];
  #priorityQueues: PriorityQueue<TaskItem>[];
  #runningTaskCount = 0;
  #isPaused = false;
  #cleanupInterval?: number;

  /**
   * 构造函数
   * @param options CascadeQ 配置选项，所有选项均为可选
   */
  constructor(options: CascadeQOptions = {}) {
    super();
    this.#maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.#baseDecay = options.baseDecay ?? DEFAULT_BASE_DECAY;
    this.#decayCurve = options.decayCurve ?? DEFAULT_DECAY_CURVE;
    this.#calcConcurrency = options.calcConcurrency ?? DEFAULT_CALC_CONCURRENCY;
    this.#taskTTL = options.taskTTL ?? DEFAULT_TASK_TTL; // 默认任务生存时长

    // 初始化队列：
    // 1. 标准化阈值配置（如未提供则使用默认阈值）
    // 2. 根据阈值创建多个优先级队列，用于任务调度
    this.#thresholds = this.#normalizeThresholds(options.thresholds ?? DEFAULT_THRESHOLDS);
    this.#priorityQueues = this.#thresholds.map(
      () =>
        new PriorityQueue<TaskItem>(
          (a, b) =>
            // 根据有效优先级排序；如果相同，则根据添加时间排序
            this.#calcEffectivePriority(a) - this.#calcEffectivePriority(b) || a.addedAt - b.addedAt
        )
    );

    // 启动定时清理，定期检查超时任务
    this.#startExpirationCheck();
  }

  // ================== 公共 API ==================

  /**
   * 添加异步任务到队列
   * @param task 返回 Promise 的异步函数
   * @param priority 基础优先级（数值越小优先级越高），可选，默认由系统分配
   * @returns 返回任务控制句柄，用于任务取消
   */
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

  /**
   * 暂停任务调度，不再启动新的任务
   */
  pause(): void {
    this.#isPaused = true;
  }

  /**
   * 恢复任务调度，并尝试启动等待中的任务
   */
  resume(): void {
    if (!this.#isPaused) return;
    this.#isPaused = false;
    this.#schedule();
  }

  /**
   * 取消指定任务
   * @param taskId 任务标识符
   * @returns 如果任务取消成功，则返回 true
   */
  cancel(taskId: symbol): boolean {
    for (const queue of this.#priorityQueues) {
      // 由于 PriorityQueue 不支持直接删除，遍历队列并重新构建
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

  /**
   * 清空所有待执行任务，并将其标记为已取消
   */
  clear(): void {
    this.#priorityQueues.forEach(queue => {
      while (queue.size > 0) {
        const task = queue.dequeue()!;
        task.status = TaskStatus.Cancelled;
        this.emit('cancel', task);
      }
    });
    this.#runningTaskCount = 0;
  }

  /**
   * 获取当前队列状态
   * @returns 包含运行中任务数、待执行任务总数及各队列详细信息
   */
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

  /**
   * 将任务放入对应优先级队列
   * @param taskItem 待执行的任务项
   */
  #enqueueTask(taskItem: TaskItem): void {
    const effectivePriority = this.#calcEffectivePriority(taskItem);
    const queueIndex = this.#thresholds.findIndex(t => effectivePriority <= t.value);
    // 若无符合条件的队列，则将任务放入最后一个队列
    const targetQueue = this.#priorityQueues[queueIndex === -1 ? this.#priorityQueues.length - 1 : queueIndex];
    targetQueue.enqueue(taskItem);
  }

  /**
   * 调度任务执行。若处于暂停状态或已达到最大并发数，则不再调度。
   */
  #schedule(): void {
    if (this.#isPaused || this.#runningTaskCount >= this.#maxConcurrency) return;
    while (this.#runningTaskCount < this.#maxConcurrency) {
      const task = this.#dequeueTask();
      if (!task) break;
      this.#executeTask(task);
    }
  }

  /**
   * 从优先级队列中取出一个任务，满足各级别的并发限制
   * @returns 下一个待执行任务，若无则返回 undefined
   */
  #dequeueTask(): TaskItem | undefined {
    for (const threshold of this.#thresholds) {
      if (this.#runningTaskCount < threshold.concurrency) {
        const index = this.#thresholds.indexOf(threshold);
        const queue = this.#priorityQueues[index];
        if (queue.size > 0) return queue.dequeue();
      }
    }
    return undefined;
  }

  /**
   * 执行任务并更新任务状态，同时在任务完成后重新调度后续任务
   * @param taskItem 待执行的任务项
   */
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

  /**
   * 标准化阈值配置，确保所有阈值配置均为 ThresholdItem 对象，按 value 升序排序
   * @param input 支持数字或 ThresholdItem 数组形式
   * @returns 标准化后的 ThresholdItem 数组
   */
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

  /**
   * 根据任务添加时间及衰减规则，计算任务的有效优先级
   * @param taskItem 待执行任务项
   * @returns 有效优先级（数值越小优先级越高）
   */
  #calcEffectivePriority(taskItem: TaskItem): number {
    const minutesElapsed = (Date.now() - taskItem.addedAt) / 60000;
    return taskItem.basePriority - this.#baseDecay * this.#decayCurve(minutesElapsed);
  }

  /**
   * 获取默认任务优先级：默认为最后一个阈值基础上增加 1
   * @returns 默认优先级数值
   */
  #getDefaultPriority(): number {
    return this.#thresholds[this.#thresholds.length - 1].value + 1;
  }

  /**
   * 创建任务句柄，便于外部取消任务
   * @param taskItem 任务项
   * @returns TaskHandle 对象，包含任务 id 和取消回调
   */
  #createTaskHandle(taskItem: TaskItem): TaskHandle {
    return {
      id: taskItem.id,
      cancel: () => this.cancel(taskItem.id),
      getStatus: () => taskItem.status
    };
  }

  /**
   * 启动定时任务清理，定期检查各队列中过期任务，将超时任务标记为已取消
   */
  #startExpirationCheck(): void {
    const checkExpiredTasks = () => {
      const now = Date.now();
      this.#priorityQueues.forEach(queue => {
        const validTasks: TaskItem[] = [];
        // 逐个检查队列中的任务
        while (queue.size > 0) {
          const task = queue.dequeue()!;
          if (now - task.addedAt < this.#taskTTL) {
            validTasks.push(task);
          } else {
            task.status = TaskStatus.Cancelled;
            this.emit('cancel', task);
          }
        }
        // 将未超时任务重新入队
        validTasks.forEach(t => queue.enqueue(t));
      });
    };

    this.#cleanupInterval = setInterval(
      checkExpiredTasks,
      60_000 // 每分钟检查一次
    ) as unknown as number; // 强制类型转换，确保跨环境兼容
  }

  /**
   * 释放当前队列资源，清除定时器、移除所有事件监听器，并清空任务队列
   */
  dispose(): void {
    if (this.#cleanupInterval !== undefined) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }
    this.removeAllListeners();
    this.clear();
  }
}
