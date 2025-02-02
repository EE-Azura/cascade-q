import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CascadeQ } from '../src/cascade-q';

describe('CascadeQ 测试', () => {
  let queue: CascadeQ;

  beforeEach(() => {
    // 这里初始化队列默认并发数，例如 10
    queue = new CascadeQ({ maxConcurrency: 10 });
  });

  it('添加任务后任务应被执行并完成', async () => {
    const taskMock = vi.fn(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    });

    queue.add(taskMock, 5);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(taskMock).toHaveBeenCalled();
    const state = queue.getState();
    expect(state.pending).toBe(0);
    expect(state.running).toBe(0);
  });

  it('取消任务后任务应被标记为取消', async () => {
    const longTask = () => new Promise<void>(resolve => setTimeout(resolve, 1000));
    const handle = queue.add(longTask, 5);

    // 立即取消任务
    handle.cancel();
    await new Promise(resolve => setTimeout(resolve, 50));
    const state = queue.getState();
    // 如果任务在执行前取消，则 pending 数量应为0
    expect(state.pending).toBe(0);
  });

  it('暂停和恢复应阻止和恢复任务调度', async () => {
    const taskMock1 = vi.fn(async () => new Promise<void>(resolve => setTimeout(resolve, 200)));
    const taskMock2 = vi.fn(async () => new Promise<void>(resolve => setTimeout(resolve, 200)));

    // 暂停队列，确保添加后任务未立即执行
    queue.pause();
    queue.add(taskMock1, 5);
    queue.add(taskMock2, 5);

    await new Promise(resolve => setTimeout(resolve, 50));
    const state = queue.getState();
    expect(state.running).toBe(0);

    // 恢复调度后，任务开始执行
    queue.resume();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(taskMock1).toHaveBeenCalled();
    expect(taskMock2).toHaveBeenCalled();
  });

  it('清空任务队列应将所有待执行任务取消', async () => {
    const longTask = () => new Promise<void>(resolve => setTimeout(resolve, 1000));
    queue.add(longTask, 5);
    queue.add(longTask, 5);

    queue.clear();
    const state = queue.getState();
    expect(state.pending).toBe(0);
  });

  it('事件触发应该符合预期', async () => {
    const onEnqueue = vi.fn();
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    // 暂停队列调度，确保任务添加后不立即执行
    queue.pause();

    // 注册事件监听器
    queue.on('enqueue', onEnqueue);
    queue.on('start', onStart);
    queue.on('complete', onComplete);
    queue.on('cancel', onCancel);

    // 添加一个正常任务
    const taskNormal = vi.fn(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    });
    queue.add(taskNormal, 1);

    // 添加一个长任务后立即取消，用于验证取消事件
    const longTask = () => new Promise<void>(resolve => setTimeout(resolve, 1000));
    const handle = queue.add(longTask, 1);
    handle.cancel();

    // 恢复队列调度
    queue.resume();
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(onEnqueue).toHaveBeenCalledTimes(2);
    // 正常任务启动后触发 start 和 complete，仅正常任务会真正执行
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('异常任务应触发 complete 事件并记录错误', async () => {
    // 使用 pause 保证任务不会立即执行
    queue.pause();
    const onComplete = vi.fn();
    queue.on('complete', onComplete);

    // 使用 spy 捕获 console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 添加一个会抛出异常的任务
    const errorTask = async () => {
      throw new Error('Test Error');
    };
    queue.add(errorTask, 1);

    queue.resume();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('高并发调度任务数应不超过最大并发限制', async () => {
    // 使用较低的并发数测试，设定为3
    queue = new CascadeQ({ maxConcurrency: 3 });
    queue.pause();

    const resolvers: Array<() => void> = [];
    // 添加 5 个任务，这些任务不会自动结束，等待手动触发完成
    for (let i = 0; i < 5; i++) {
      queue.add(() => {
        return new Promise<void>(resolve => {
          resolvers.push(resolve);
        });
      }, 1);
    }

    queue.resume();
    await new Promise(resolve => setTimeout(resolve, 50));
    const state = queue.getState();
    // 正在运行的任务数不应超过 3
    expect(state.running).toBeLessThanOrEqual(3);

    // 手动完成所有任务
    resolvers.forEach(resolve => resolve());
    await new Promise(resolve => setTimeout(resolve, 50));
  });
});
