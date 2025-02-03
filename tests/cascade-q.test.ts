import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { CascadeQ } from '../src/cascade-q';
import { TaskStatus } from '../src/types';

// 启用 fake timers
beforeAll(() => {
  vi.useFakeTimers();
});
afterAll(() => {
  vi.useRealTimers();
});

// 辅助函数：延迟指定毫秒
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('CascadeQ 完整测试套件', () => {
  let queue: CascadeQ;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new CascadeQ({ maxConcurrency: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
    queue.dispose();
  });

  // 基础功能测试
  describe('核心功能', () => {
    it('添加执行任务', async () => {
      const task = vi.fn().mockResolvedValue(null);
      queue.add(task, 0);

      await vi.advanceTimersByTimeAsync(50);
      expect(task).toHaveBeenCalled();
    });

    it('取消未执行任务', async () => {
      queue.pause(); // 暂停任务调度，防止任务立即执行
      const task = vi.fn();
      const handle = queue.add(task, 0);

      handle.cancel();
      await vi.advanceTimersByTimeAsync(50);

      expect(task).not.toHaveBeenCalled();
      expect(handle.getStatus()).toBe(TaskStatus.Cancelled);
      queue.resume(); // 恢复调度（如果需要后续测试继续执行）
    });

    it('暂停/恢复调度', async () => {
      const task = vi.fn().mockResolvedValue(null);
      queue.pause();
      queue.add(task, 0);

      await vi.advanceTimersByTimeAsync(100);
      expect(task).not.toHaveBeenCalled();

      queue.resume();
      await vi.advanceTimersByTimeAsync(10);
      expect(task).toHaveBeenCalled();
    });
  });

  // 优先级测试
  describe('优先级调度', () => {
    it('应按照有效优先级排序', async () => {
      const execOrder: number[] = [];
      queue = new CascadeQ({
        thresholds: [0, 5],
        maxConcurrency: 1
      });

      // 低优先级但早添加
      queue.add(async () => {
        execOrder.push(2);
        await delay(50);
      }, 5);

      // 高优先级但晚添加
      await delay(10);
      queue.add(async () => {
        execOrder.push(1);
        await delay(50);
      }, 0);

      await vi.advanceTimersByTimeAsync(200);
      expect(execOrder).toEqual([1, 2]);
    });

    it('时间衰减应提升优先级', async () => {
      queue = new CascadeQ({
        thresholds: [5, 10], // 队列0: 优先级≤5，队列1: 5<优先级≤10
        baseDecay: 0.1 // 每分钟衰减0.1
      });

      // 初始优先级为6 → 进入队列1
      const handle = queue.add(() => delay(50), 6);

      // 验证初始状态
      let state = queue.getState();
      expect(state.queues[1].pending).toBe(1);
      expect(handle.getStatus()).toBe(TaskStatus.Pending);

      // 模拟等待6分钟（衰减0.6），有效优先级=6-0.6=5.4 → 应移至队列0
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

      // 验证队列状态和任务状态
      state = queue.getState();
      expect(state.queues[0].pending).toBe(1); // 队列0有1个任务
      expect(state.queues[1].pending).toBe(0); // 队列1无任务
      expect(handle.getStatus()).toBe(TaskStatus.Pending);
    });
  });

  // 并发控制测试
  describe('并发控制', () => {
    it('应遵守层级并发限制', async () => {
      queue = new CascadeQ({
        thresholds: [
          { value: 0, concurrency: 1, level: 'high' },
          { value: 5, concurrency: 2, level: 'low' }
        ],
        maxConcurrency: 3
      });

      // 添加任务
      queue.add(() => delay(200), 0); // 高优先级
      queue.add(() => delay(200), 0); // 应被阻塞
      queue.add(() => delay(200), 5); // 中优先级
      queue.add(() => delay(200), 5); // 中优先级
      queue.add(() => delay(200), 10); // 低优先级

      await vi.advanceTimersByTimeAsync(10);

      const state = queue.getState();
      expect(state.running).toBe(3); // 0级1个 + 5级2个
      expect(state.queues[0].pending).toBe(1);
    });

    it('应动态调整并发策略', async () => {
      queue = new CascadeQ({
        calcConcurrency: i => (i === 0 ? 3 : 0)
      });

      // 添加任务
      Array(5)
        .fill(0)
        .forEach(() => queue.add(() => delay(100), 0));
      Array(5)
        .fill(0)
        .forEach(() => queue.add(() => delay(100), 5));

      await vi.advanceTimersByTimeAsync(50);
      expect(queue.getState().running).toBe(3);
    });
  });

  // 生命周期测试
  describe('生命周期管理', () => {
    it('应清理过期任务', async () => {
      queue = new CascadeQ({ taskTTL: 100 });
      const onCancel = vi.fn();
      queue.on('cancel', onCancel);

      queue.add(() => new Promise(() => {})); // 永不完成
      await vi.advanceTimersByTimeAsync(200);

      expect(onCancel).toHaveBeenCalled();
      expect(queue.getState().pending).toBe(0);
    });

    it('销毁后拒绝新任务', () => {
      queue.dispose();
      expect(() => queue.add(() => Promise.resolve())).toThrow(/disposed/);
    });
  });

  // 事件系统测试
  describe('事件系统', () => {
    it('应触发完整事件序列', async () => {
      const events: string[] = [];
      const task = vi.fn().mockResolvedValue(null);

      queue.on('enqueue', () => events.push('enqueue'));
      queue.on('start', () => events.push('start'));
      queue.on('complete', () => events.push('complete'));

      queue.add(task, 0);
      await vi.advanceTimersByTimeAsync(100);

      expect(events).toEqual(['enqueue', 'start', 'complete']);
    });

    it('事件参数应完整', async () => {
      const testTask = { id: Symbol('test'), priority: 0 };
      queue.on('enqueue', task => {
        expect(task).toMatchObject({
          id: expect.any(Symbol),
          basePriority: testTask.priority,
          status: TaskStatus.Pending
        });
      });

      queue.add(() => Promise.resolve(), testTask.priority);
      await vi.advanceTimersByTimeAsync(10);
    });
  });

  // 边界情况测试
  describe('边界情况', () => {
    it('空队列状态', () => {
      const state = queue.getState();
      expect(state).toEqual({
        running: 0,
        pending: 0,
        queues: expect.any(Array)
      });
    });

    it('批量任务处理', async () => {
      const taskCount = 1000;
      const tasks = Array(taskCount).fill(() => Promise.resolve());

      const start = performance.now();
      tasks.forEach(fn => queue.add(fn));
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50); // 千级任务应在50ms内处理
      expect(queue.getState().pending).toBe(taskCount - 3); // 3个立即执行
    });

    it('异常任务处理', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('test error');

      queue.add(() => Promise.reject(error), 0);
      await vi.advanceTimersByTimeAsync(50);

      expect(errorSpy).toHaveBeenCalledWith('Task execution failed:', error);
      errorSpy.mockRestore();
    });
  });
});
