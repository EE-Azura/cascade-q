# CascadeQ

多优先级任务调度器，支持动态任务优先级衰减、并发任务数控制、超时任务清理以及事件驱动的任务状态通知。该库适用于 HTTP 请求、日志记录等场景。

## 特性

- **动态优先级衰减**：任务优先级会随着时间衰减，实现更合理的任务分配。
- **并发控制**：支持全局及各优先级的并发数控制，提供线性或自定义分配策略。
- **任务超时清理**：定时清理超时任务，保证队列健康状态。
- **事件通知**：任务添加、启动、完成、取消等状态均能触发事件通知，方便监听管理。

## 安装

使用 npm 安装该库：

```bash
npm install cascade-q
```

## 快速上手

下面是一个简单的使用示例：

```typescript
import { CascadeQ } from 'cascade-q';

const queue = new CascadeQ({ maxConcurrency: 5 });

// 添加任务，并设定基础优先级为 10
const handle = queue.add(() => fetch('https://example.com/api/data'), 10);

// 监听任务事件
queue.on('enqueue', task => console.log(`任务 [${task.id.toString()}] 被添加`));
queue.on('start', task => console.log(`任务 [${task.id.toString()}] 开始执行`));
queue.on('complete', task => console.log(`任务 [${task.id.toString()}] 执行完毕`));
queue.on('cancel', task => console.log(`任务 [${task.id.toString()}] 已取消`));

// 如有需要，可取消任务
// handle.cancel();
```

## API 说明

### CascadeQ 类

| 方法                                                             | 参数说明                                                                                                        | 返回值        | 描述                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------- |
| constructor(options?: CascadeQOptions)                           | options: CascadeQ 配置选项，包含 maxConcurrency、baseDecay、decayCurve、calcConcurrency、taskTTL、thresholds 等 | CascadeQ 实例 | 初始化调度器实例。                                                         |
| add(task: () => Promise<unknown>, priority?: number): TaskHandle | task: 返回 Promise 的异步函数<br>priority: 任务基础优先级（数值越小优先级越高）                                 | TaskHandle    | 添加任务到队列，并返回任务控制句柄（包含取消任务与状态查询方法）。         |
| pause(): void                                                    | 无                                                                                                              | void          | 暂停任务调度，新任务不会被启动，但已在运行的任务不会中断。                 |
| resume(): void                                                   | 无                                                                                                              | void          | 恢复任务调度，并尝试启动等待中的任务。                                     |
| cancel(taskId: symbol): boolean                                  | taskId: 任务标识符                                                                                              | boolean       | 取消指定任务，返回任务是否成功取消。                                       |
| clear(): void                                                    | 无                                                                                                              | void          | 清空所有待执行任务，并将其标记为取消。                                     |
| getState(): object                                               | 无                                                                                                              | 状态对象      | 获取当前队列状态，包括运行中任务数、待执行任务总数及各优先级队列详细信息。 |

### 事件

CascadeQ 继承自 EventEmitter，支持以下事件：

| 事件名称 | 描述                 | 参数          |
| -------- | -------------------- | ------------- |
| enqueue  | 任务被加入队列时触发 | TaskItem 对象 |
| start    | 任务开始执行时触发   | TaskItem 对象 |
| complete | 任务执行完成后触发   | TaskItem 对象 |
| cancel   | 任务被取消时触发     | TaskItem 对象 |

## 其他模块

### PriorityQueue

一个基于小顶堆实现的优先级队列，为 CascadeQ 提供任务排序保证。

#### 主要方法

| 方法    | 参数    | 返回值         | 描述                   |
| ------- | ------- | -------------- | ---------------------- |
| enqueue | item: T | void           | 入队新元素             |
| dequeue | 无      | T \| undefined | 出队最高优先等级的元素 |
| size    | 无      | number         | 返回当前队列大小       |

### EventEmitter

基础事件机制，支持注册、注销与事件广播。

| 方法               | 参数                                     | 返回值 | 描述                               |
| ------------------ | ---------------------------------------- | ------ | ---------------------------------- |
| on                 | event: QueueEvent, handler: EventHandler | void   | 注册指定事件的回调函数             |
| off                | event: QueueEvent, handler: EventHandler | void   | 注销指定事件的回调函数             |
| emit               | event: QueueEvent, task: TaskItem        | void   | 触发指定事件并通知所有回调         |
| removeAllListeners | 无                                       | void   | 清除此事件系统所有已注册的回调函数 |

## 默认配置

默认配置文件（default.ts）中定义了以下常量：

- DEFAULT_MAX_CONCURRENCY：默认最大并发数（10）
- DEFAULT_BASE_DECAY：默认基础优先级衰减（0.05）
- DEFAULT_DECAY_CURVE：简单线性衰减函数
- DEFAULT_TASK_TTL：任务生存时长（60秒）
- DEFAULT_THRESHOLDS：任务优先级阈值配置，可用于支持两级优先级划分

## 开源协议

该项目采用 MIT 协议，详细见 LICENSE 文件。

## 联系方式

如有问题或建议，请在 GitHub 项目的 issues 区提交反馈，项目地址：[CascadeQ Issues](https://github.com/ee-azura/cascade-q/issues)。
