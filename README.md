# CascadeQ

轻量级多优先级任务调度器，支持动态任务优先级衰减、并发任务数控制、超时任务清理以及事件驱动的任务状态通知。该库适用于 HTTP 请求、日志记录等场景。

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

## 快速开始

```typescript
import { CascadeQ } from 'cascadeq';

// 创建队列实例
const queue = new CascadeQ({
  maxConcurrency: 5,
  thresholds: [0, 10] // 0: 高优先级, 10: 低优先级
});

// 添加高优先级任务
const task1 = queue.add(async () => {
  await fetch('/api/data');
}, 0);

// 添加低优先级任务（自动延迟）
queue.add(async () => {
  await sendAnalytics();
});

// 监听任务事件
queue.on('start', task => {
  console.log('Task started:', task.id);
});
```

---

## API 文档

### 核心类 `CascadeQ`

#### 配置选项

| 参数              | 类型                                      | 默认值       | 说明                     |
| ----------------- | ----------------------------------------- | ------------ | ------------------------ |
| `maxConcurrency`  | `number`                                  | `10`         | 全局最大并发任务数       |
| `baseDecay`       | `number`                                  | `0.05`       | 每分钟优先级衰减基数     |
| `decayCurve`      | `(minutes: number) => number`             | `m => m`     | 衰减曲线函数             |
| `calcConcurrency` | `(index, { max, totalLevels }) => number` | [见默认策略] | 并发计算函数             |
| `taskTTL`         | `number`                                  | `60000`      | 任务最长存活时间（毫秒） |
| `thresholds`      | `Array<number \| ThresholdItem>`          | `[0, 10]`    | 优先级阈值配置           |

#### 方法

| 方法       | 参数                                        | 返回值       | 说明         |
| ---------- | ------------------------------------------- | ------------ | ------------ |
| `add`      | `task: () => Promise<T>, priority?: number` | `TaskHandle` | 添加异步任务 |
| `cancel`   | `taskId: symbol`                            | `boolean`    | 取消指定任务 |
| `pause`    | -                                           | `void`       | 暂停任务调度 |
| `resume`   | -                                           | `void`       | 恢复任务调度 |
| `clear`    | -                                           | `void`       | 清空所有队列 |
| `getState` | -                                           | `QueueState` | 获取队列状态 |
| `dispose`  | -                                           | `void`       | 销毁队列实例 |

#### 事件系统

| 事件名     | 触发时机     | 回调参数   |
| ---------- | ------------ | ---------- |
| `enqueue`  | 任务入队时   | `TaskItem` |
| `start`    | 任务开始执行 | `TaskItem` |
| `complete` | 任务完成时   | `TaskItem` |
| `cancel`   | 任务被取消   | `TaskItem` |

---

### 类型定义

#### `ThresholdItem`

| 属性          | 类型               | 说明             |
| ------------- | ------------------ | ---------------- |
| `level`       | `string \| symbol` | 层级标识         |
| `value`       | `number`           | 优先级阈值       |
| `concurrency` | `number`           | 本层级最大并发数 |

#### `TaskHandle`

| 属性/方法   | 类型               | 说明         |
| ----------- | ------------------ | ------------ |
| `id`        | `symbol`           | 任务唯一标识 |
| `cancel`    | `() => boolean`    | 取消任务     |
| `getStatus` | `() => TaskStatus` | 获取当前状态 |

#### `QueueState`

| 属性      | 类型                                     | 说明           |
| --------- | ---------------------------------------- | -------------- |
| `running` | `number`                                 | 运行中任务数   |
| `pending` | `number`                                 | 等待中任务总数 |
| `queues`  | `Array<{ level, concurrency, pending }>` | 各队列详情     |

---

## 高级配置示例

### 自定义并发策略

```typescript
new CascadeQ({
  calcConcurrency: (index, { max, totalLevels }) => {
    // 指数衰减策略
    return Math.floor(max * 0.5 ** index);
  }
});
```

### 非线性衰减曲线

```typescript
new CascadeQ({
  baseDecay: 0.1,
  decayCurve: m => Math.sqrt(m) // 平方根衰减
});
```

### 复杂阈值配置

```typescript
new CascadeQ({
  thresholds: [
    { level: 'URGENT', value: -5, concurrency: 3 },
    { level: 'HIGH', value: 0 },
    10 // 简写形式自动转换
  ]
});
```

---

## 开源协议

该项目采用 MIT 协议，详细见 [LICENSE](LICENSE) 。

## 联系方式

如有问题或建议，请在 GitHub 项目的 issues 区提交反馈，项目地址：[CascadeQ Issues](https://github.com/ee-azura/cascade-q/issues)。
