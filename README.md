# **CascadeQ**

CascadeQ 是一个多优先级异步任务调度器，专为需要精细任务优先级控制和并发管理的 JavaScript/TypeScript 应用设计。

## **特性**

- **多级优先级队列** - 根据阈值自动分配任务到不同优先级队列
- **优先级衰减机制** - 任务优先级会随时间自动提升，避免低优先级任务无限期等待
- **灵活并发控制** - 全局并发限制和队列级别并发配置
- **事件系统** - 完整的任务生命周期事件
- **任务管理** - 支持任务取消、暂停/恢复和超时清理
- **强类型支持** - 完整的 TypeScript 类型定义

## **安装**

```bash
npm install cascade-q
```

## **基本用法**

```tsx
import { CascadeQ } from 'cascade-q';
import type { TaskHandle } from 'cascade-q/types';

// 创建一个多优先级队列实例
const queue = new CascadeQ({
  thresholds: [0, 10], // 两个优先级级别：高(<=0)和低(<=10)
  maxConcurrency: 3 // 最大同时运行3个任务
});

// 添加高优先级任务
queue.add(async (): Promise<unknown> => {
  const response = await fetch('/api/important-data');
  return response.json();
}, 0); // 优先级0（高）

// 添加低优先级任务并获取类型化的句柄
const handle: TaskHandle = queue.add(async (): Promise<unknown> => {
  const response = await fetch('/api/less-important-data');
  return response.json();
}, 5); // 优先级5（低）

// 等待任务完成并获取结果
const result = await queue.add(async () => {
  return await fetchData();
});

// 或使用Promise链
queue
  .add(async () => fetchData())
  .then(result => console.log(result))
  .catch(error => console.error(error));

// 取消特定任务
handle.cancel();
```

```tsx
import { CascadeQ } from 'cascade-q';
import type { CascadeQState } from 'cascade-q/types';

// 带有命名的三级优先级队列
const queue = new CascadeQ({
  thresholds: [
    { value: 0, name: 'critical' }, // 关键任务
    { value: 10, name: 'normal' }, // 普通任务
    { value: 20, name: 'background' } // 后台任务
  ]
});

// 获取命名队列的状态
const state: CascadeQState = queue.getState();
const criticalQueueState = state.queues.find(q => q.level === 'critical');
```

## **核心概念**

### **优先级阈值**

优先级阈值定义了任务根据优先级值被分配到哪个队列：

```tsx
// 示例：三级优先级队列
const queue = new CascadeQ({
  thresholds: [0, 10, 20]
});

// 优先级 <= 0 的任务进入第一个队列（最高优先级）
// 优先级 <= 10 的任务进入第二个队列
// 优先级 <= 20 的任务进入第三个队列
```

### **优先级衰减**

任务优先级会随时间自动提升（数值降低）：

```tsx
import { CascadeQ } from 'cascade-q';
import type { DecayCurve } from 'cascade-q/types';

// 配置任务优先级如何随时间衰减
const queue = new CascadeQ({
  baseDecay: 0.5, // 每单位时间优先级提升0.5
  decayCurve: (n: number): number => n, // 线性衰减
  priorityDecayInterval: 60000 // 每分钟计算一次衰减
});

// 指数衰减（优先级提升加速）示例
const exponentialDecay: DecayCurve = (n: number): number => Math.pow(n, 2);
const queue2 = new CascadeQ({
  decayCurve: exponentialDecay
});
```

### **并发控制机制**

CascadeQ 提供两层级的并发管理：

- **全局并发控制** - 通过 `maxConcurrency` 限制总并发数
- **队列级并发分配** - 通过 `calcConcurrency` 在不同优先级队列间分配并发额度

```tsx
import { CascadeQ } from 'cascade-q';
import type { CalcConcurrency, CascadeQState } from 'cascade-q/types';

// 自定义并发分配策略
// *注意：这是简化示例，实际应用中应考虑总并发限制和更多队列的情况
const customConcurrencyStrategy: CalcConcurrency = (index: number, state: CascadeQState): number => {
  if (pending === 0 || queues[index].pending === 0) return 0;
  // 高优先级队列(index=0)获得更多并发额度
  if (index === 0) return Math.min(8, state.queues[0].pending);
  // 低优先级队列每个最多2个并发
  return Math.min(2, state.queues[index].pending);
};

const queue = new CascadeQ({
  thresholds: [0, 10]
  maxConcurrency: 10, // 全局最大并发数
  calcConcurrency: customConcurrencyStrategy
});
```

### 默认并发策略

CascadeQ 的默认并发分配策略采用"两阶段加权分配"原则，通过队列优先级和任务数量动态调整并发资源，确保系统资源高效利用：

```tsx
// 默认并发计算策略
const DEFAULT_CALC_CONCURRENCY: CalcConcurrency = (index: number, { max, pending, queues }: CascadeQState): number => {
  // 第一阶段: 基础计算
  if (pending === 0 || queues[index].pending === 0) return 0;

  const totalLevels = queues.length;
  const levelWeight = (totalLevels - index) / totalLevels;
  let levelShare = Math.ceil((max * levelWeight * queues[index].pending) / pending);
  levelShare = Math.min(levelShare, queues[index].pending);

  // 第二阶段: 确保高优先级队列获得足够资源
  if (index === 0 && levelShare < queues[0].pending) {
    levelShare = Math.min(Math.ceil(max * 0.6), queues[0].pending);
  }

  return levelShare;
};
```

#### **策略特点**

- **优先级加权** - 优先级越高的队列获得更高权重，如三级队列中最高优先级队列权重为100%，中等优先级队列权重为66.7%，低优先级队列权重为33.3%
- **按需分配** - 考虑各队列任务数量，根据任务分布按比例分配并发资源
- **高优先级保障** - 确保高优先级队列获得至少60%的并发资源（如有需要）
- **动态调整** - 随着任务执行和添加，自动重新计算最优并发分配
- **资源利用最大化** - 使用向上取整而非向下取整，确保并发资源得到充分利用
- **精细控制** - 精确计算每个队列的实际需求，不强制分配不需要的并发额度

## **配置选项**

| 选项                    | 类型                           | 默认值                        | 描述                                                |
| ----------------------- | ------------------------------ | ----------------------------- | --------------------------------------------------- |
| `maxConcurrency`        | `number`                       | `10`                          | 最大并发任务数                                      |
| `thresholds`            | `Array<number\|ThresholdItem>` | `[0, 10]`                     | 优先级队列的阈值配置 [完整配置对象](#thresholditem) |
| `baseDecay`             | `number`                       | `0.5`                         | 基础优先级衰减率                                    |
| `decayCurve`            | `DecayCurve`                   | `n => n`                      | 优先级衰减曲线函数                                  |
| `priorityDecayInterval` | `number`                       | `60000`                       | 优先级衰减计算间隔(毫秒)                            |
| `calcConcurrency`       | `CalcConcurrency`              | [默认并发策略](#默认并发策略) | 队列并发额度分配算法                                |
| `taskTTL`               | `number`                       | `60000`                       | 任务最大生存时间(毫秒)                              |
| `cleanupInterval`       | `number`                       | `60000`                       | 过期任务清理间隔(毫秒)                              |
| `priorityCheckInterval` | `number`                       | `10000`                       | 优先级检查间隔(毫秒)                                |

### `ThresholdItem`

| 属性    | 类型     | 描述                                                       |
| ------- | -------- | ---------------------------------------------------------- |
| `value` | `number` | 优先级阈值，任务的 basePriority ≤ value 将被分配到对应队列 |
| `name?` | `string` | 可选的队列名称，用于标识队列，便于状态查询和日志记录       |

## **API 参考**

### **队列操作方法**

| 方法       | 参数                                        | 返回值          | 描述                                               |
| ---------- | ------------------------------------------- | --------------- | -------------------------------------------------- |
| `add<T>`   | `task: () => Promise<T>, priority?: number` | `TaskHandle<T>` | 添加异步任务到队列，返回任务控制句柄               |
| `pause`    | 无                                          | `void`          | 暂停队列调度，已执行的任务继续运行，新任务不会启动 |
| `resume`   | 无                                          | `void`          | 恢复队列调度                                       |
| `cancel`   | `taskId: symbol`                            | `boolean`       | 取消特定任务，成功返回 `true`                      |
| `clear`    | 无                                          | `void`          | 清空所有待执行任务                                 |
| `getState` | 无                                          | `CascadeQState` | 获取队列当前状态信息                               |
| `dispose`  | 无                                          | `void`          | 释放队列资源，清理定时器，队列不再可用             |

### **事件监听方法**

| 方法  | 参数                                                                  | 返回值 | 描述           |
| ----- | --------------------------------------------------------------------- | ------ | -------------- |
| `on`  | `event: QueueEvent, handler: (task: TaskItem, error?: Error) => void` | `void` | 添加事件监听器 |
| `off` | `event: QueueEvent, handler: (task: TaskItem, error?: Error) => void` | `void` | 移除事件监听器 |

### **TaskHandle 方法**

| 方法        | 参数                        | 返回值             | 描述                                             |
| ----------- | --------------------------- | ------------------ | ------------------------------------------------ |
| `cancel`    | 无                          | `boolean`          | 取消任务（仅限 `pending` 状态），成功返回 `true` |
| `getStatus` | 无                          | `TaskStatus`       | 获取当前任务状态                                 |
| `then`      | `onfulfilled?, onrejected?` | `Promise<unknown>` | `Promise` 接口，支持等待任务完成                 |
| `catch`     | `onrejected`                | `Promise<unknown>` | `Promise` 接口，捕获任务错误                     |
| `finally`   | `onfinally`                 | `Promise<unknown>` | `Promise` 接口，无论任务成功或失败都执行         |

## `QueueEvent`

| 事件名称   | 回调参数          | 触发时机                   |
| ---------- | ----------------- | -------------------------- |
| `enqueue`  | `TaskItem`        | 任务被添加到队列时         |
| `start`    | `TaskItem`        | 任务开始执行时             |
| `success`  | `TaskItem`        | 任务成功完成时             |
| `fail`     | `TaskItem, Error` | 任务执行失败时             |
| `complete` | `TaskItem`        | 任务完成时(无论成功或失败) |
| `cancel`   | `TaskItem`        | 任务被取消时               |

## **状态定义**

### **`TaskStatus`**

| 状态        | 描述             |
| ----------- | ---------------- |
| `Pending`   | 任务在队列中等待 |
| `Running`   | 任务正在执行中   |
| `Success`   | 任务已成功完成   |
| `Failed`    | 任务执行失败     |
| `Cancelled` | 任务已被取消     |

### **`CascadeQState`**

| 属性      | 类型     | 描述                   |
| --------- | -------- | ---------------------- |
| `running` | `number` | 当前正在执行的任务总数 |
| `pending` | `number` | 当前等待执行的任务总数 |
| `max`     | `number` | 最大并发任务数         |
| `queues`  | `array`  | 各优先级队列的详细状态 |

### `state.queues[index]`

| 属性          | 类型             | 描述                     |
| ------------- | ---------------- | ------------------------ |
| `level`       | `number\|string` | 队列的优先级阈值或标识符 |
| `concurrency` | `number`         | 该队列当前的并发额度     |
| `running`     | `number`         | 该队列中正在执行的任务数 |
| `pending`     | `number`         | 该队列中等待执行的任务数 |

## **许可证**

[MIT](./LICENSE)
