import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { CascadeQ } from '../src/cascade-q';
import { TaskStatus } from '../src/types';

/**
 * 延时工具函数，用于模拟异步任务
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('CascadeQ 完整测试套件', () => {
  let queue: CascadeQ;

  // 开始测试前启用 fake timers
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    // 每个测试前重建队列，并确保调度恢复
    queue = new CascadeQ();
    queue.resume();
  });

  // 核心功能测试
  describe('核心功能', () => {
    it('取消未执行任务', async () => {
      // 暂停调度，确保任务未执行
      queue.pause();
      const task = vi.fn(() => delay(100));
      const handle = queue.add(task, 0);
      // 立即取消任务
      handle.cancel();
      // 推进时间保证任务调度被触发（若未取消，任务会执行）
      await vi.advanceTimersByTimeAsync(50);
      expect(task).not.toHaveBeenCalled();
      expect(handle.getStatus()).toBe(TaskStatus.Cancelled);
      queue.resume();
    });

    it('添加任务后任务应被执行并完成', async () => {
      const task = vi.fn(() => delay(50));
      const handle = queue.add(task, 0);
      await vi.advanceTimersByTimeAsync(100);
      expect(task).toHaveBeenCalled();
      expect(handle.getStatus()).toBe(TaskStatus.Completed);
    });
  });

  // 优先级调度测试
  describe('优先级调度', () => {
    it('应按照有效优先级排序', async () => {
      const execOrder: number[] = [];
      // 自定义 calcConcurrency 确保每个优先级队列至少有1个并发额度
      queue = new CascadeQ({
        thresholds: [0, 5],
        maxConcurrency: 1
      });

      queue.pause(); // 暂停调度

      // 先添加低优先级任务（basePriority 为 5，对应后面的队列）
      queue.add(async () => {
        execOrder.push(2);
        await delay(50);
      }, 5);

      queue.add(async () => {
        execOrder.push(1);
        await delay(50);
      }, 0);

      queue.resume(); // 恢复调度

      // 推进时间使所有任务启动并执行完毕
      await vi.advanceTimersByTimeAsync(200);
      expect(execOrder).toEqual([1, 2]);
    });

    it('时间衰减应提升优先级', async () => {
      // 调整队列配置，设置较慢衰减便于观察
      queue = new CascadeQ({
        thresholds: [0, 10],
        baseDecay: 0.1
      });

      // 添加任务，初始 basePriority 为6（应进入低优先级队列）
      const handle = queue.add(async () => {
        await delay(50);
      }, 6);

      // 初始状态：任务应位于较低优先级的队列中
      let state = queue.getState();
      expect(state.queues[1].pending).toBeGreaterThanOrEqual(1);
      expect(handle.getStatus()).toBe(TaskStatus.Pending);

      // 推进6分钟时间：有效优先级 = 6 - 6*0.1 = 5.4，理论上可能进入高优先级队列
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
      state = queue.getState();
      expect(state.queues[0].pending).toBeGreaterThanOrEqual(1);
      expect(handle.getStatus()).toBe(TaskStatus.Pending);
    });
  });

  // 并发控制测试
  describe('并发控制', () => {
    it('应遵守层级并发限制', async () => {
      // 自定义 calcConcurrency：队列0限1个并发，队列1限2个并发
      const customCalcConcurrency = (index: number) => {
        if (index === 0) return 1;
        if (index === 1) return 2;
        return 0;
      };
      queue = new CascadeQ({
        thresholds: [0, 5],
        maxConcurrency: 3,
        calcConcurrency: customCalcConcurrency
      });

      // 添加任务，确保任务进入对应队列（basePriority 决定队列）
      const task0 = vi.fn(() => delay(100)); // 队列0
      const task1 = vi.fn(() => delay(100)); // 队列1
      const task2 = vi.fn(() => delay(100)); // 队列1
      queue.add(task0, 0);
      queue.add(task1, 5);
      queue.add(task2, 5);

      // 推进部分时间，确保任务开始执行
      await vi.advanceTimersByTimeAsync(50);
      const state = queue.getState();
      // 预期：队列0 1个 + 队列1 2个 = 3个运行中任务
      expect(state.running).toBe(3);
      // 由于任务已被启动，队列0中 pending 为0
      expect(state.queues[0].pending).toBe(0);
    });

    it('应动态调整并发策略', async () => {
      // 此处设定只有队列0具有并发额度（3个），队列1不允许并发
      queue = new CascadeQ({
        thresholds: [0, 5],
        calcConcurrency: (i: number) => (i === 0 ? 3 : 0)
      });
      // 分别添加5个任务到两个队列：basePriority 0进入队列0，5进入队列1
      for (let i = 0; i < 5; i++) {
        queue.add(() => delay(100), 0);
      }
      for (let i = 0; i < 5; i++) {
        queue.add(() => delay(100), 5);
      }
      await vi.advanceTimersByTimeAsync(50);
      expect(queue.getState().running).toBe(3);
      expect(queue.getState().queues[0].pending).toBe(2);
      expect(queue.getState().queues[1].pending).toBe(5);
    });
  });

  // 生命周期管理测试
  describe('生命周期管理', () => {
    it('应清理过期任务', async () => {
      // 添加永远无法完成的任务，用于模拟超时
      const task = vi.fn(() => new Promise<void>(() => {}));
      queue = new CascadeQ({ taskTTL: 100 }); // 设置 TTL 为100ms
      const handle = queue.add(task, 0);
      // 推进足够时间触发任务过期清理
      await vi.advanceTimersByTimeAsync(200);
      expect(handle.getStatus()).toBe(TaskStatus.Cancelled);
    });

    it('销毁后应拒绝新任务', async () => {
      queue.dispose();
      // 添加任务时应抛出异常或拒绝
      expect(() => queue.add(() => delay(50), 0)).toThrow();
    });
  });

  // 事件系统测试
  describe('事件系统', () => {
    it('应触发完整事件序列', async () => {
      const onEnqueue = vi.fn();
      const onStart = vi.fn();
      const onComplete = vi.fn();
      queue = new CascadeQ();
      queue.on('enqueue', onEnqueue);
      queue.on('start', onStart);
      queue.on('complete', onComplete);
      const task = vi.fn(() => delay(50));
      queue.add(task, 0);
      await vi.advanceTimersByTimeAsync(100);
      expect(onEnqueue).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('事件参数应完整', async () => {
      const onComplete = vi.fn();
      queue = new CascadeQ();
      queue.on('complete', onComplete);
      const task = vi.fn(() => delay(50));
      queue.add(task, 0);
      await vi.advanceTimersByTimeAsync(100);
      expect(onComplete).toHaveBeenCalled();
      const taskArg = onComplete.mock.calls[0][0];
      expect(taskArg).toHaveProperty('id');
      expect(taskArg).toHaveProperty('addedAt');
      expect(taskArg).toHaveProperty('status');
    });
  });

  // 边界情况测试
  describe('边界情况', () => {
    it('空队列状态', () => {
      const state = queue.getState();
      expect(state.pending).toBe(0);
      expect(state.running).toBe(0);
    });

    it('批量任务处理', async () => {
      // 添加大量任务后，部分任务应已完成，pending 数目减少
      for (let i = 0; i < 1000; i++) {
        queue.add(() => delay(10), 0);
      }
      await vi.advanceTimersByTimeAsync(50);
      const state = queue.getState();
      expect(state.pending).toBeLessThan(1000);
    });
  });

  // 异常任务处理测试
  describe('异常任务处理', () => {
    it('应处理任务异常', async () => {
      const onComplete = vi.fn();
      const onError = vi.fn();
      queue = new CascadeQ();
      queue.on('complete', onComplete);
      queue.on('error', onError);
      const failingTask = async () => {
        throw new Error('Test Error');
      };
      queue.add(failingTask, 0);
      await vi.advanceTimersByTimeAsync(100);
      expect(onError).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
