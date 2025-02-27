[简体中文](./README.md) | English

# **CascadeQ**

CascadeQ is a multi-priority asynchronous task scheduler designed for JavaScript/TypeScript applications that require fine-grained task priority control and concurrency management.

## **Features**

- **Multi-level priority queues** - Automatically distributes tasks to different priority queues based on thresholds
- **Priority decay mechanism** - Task priorities automatically increase over time to prevent low-priority tasks from waiting indefinitely
- **Flexible concurrency control** - Global concurrency limits and queue-level concurrency configuration
- **Event system** - Complete task lifecycle events
- **Task management** - Support for task cancellation, pause/resume, and timeout cleanup
- **Strong type support** - Complete TypeScript type definitions

## **Installation**

```bash
npm install cascade-q
```

## **Basic Usage**

```tsx
import { CascadeQ } from 'cascade-q';
import type { TaskHandle } from 'cascade-q/types';

// Create a multi-priority queue instance
const queue = new CascadeQ({
  thresholds: [0, 10], // Two priority levels: high(<=0) and low(<=10)
  maxConcurrency: 3 // Maximum of 3 concurrent tasks
});

// Add high-priority task
queue.add(async (): Promise<unknown> => {
  const response = await fetch('/api/important-data');
  return response.json();
}, 0); // Priority 0 (high)

// Add low-priority task and get typed handle
const handle: TaskHandle = queue.add(async (): Promise<unknown> => {
  const response = await fetch('/api/less-important-data');
  return response.json();
}, 5); // Priority 5 (low)

// Wait for task to complete and get result
const result = await queue.add(async () => {
  return await fetchData();
});

// Or use Promise chaining
queue
  .add(async () => fetchData())
  .then(result => console.log(result))
  .catch(error => console.error(error));

// Cancel a specific task
handle.cancel();
```

```tsx
import { CascadeQ } from 'cascade-q';
import type { CascadeQState } from 'cascade-q/types';

// Three-level priority queue with named thresholds
const queue = new CascadeQ({
  thresholds: [
    { value: 0, name: 'critical' }, // Critical tasks
    { value: 10, name: 'normal' }, // Normal tasks
    { value: 20, name: 'background' } // Background tasks
  ]
});

// Get the state of named queues
const state: CascadeQState = queue.getState();
const criticalQueueState = state.queues.find(q => q.level === 'critical');
```

## **Core Concepts**

### **Priority Thresholds**

Priority thresholds define which queue a task is assigned to based on its priority value:

```tsx
// Example: Three-level priority queue
const queue = new CascadeQ({
  thresholds: [0, 10, 20]
});

// Tasks with priority <= 0 go to the first queue (highest priority)
// Tasks with priority <= 10 go to the second queue
// Tasks with priority <= 20 go to the third queue
```

### **Priority Decay**

Task priorities automatically increase (values decrease) over time:

```tsx
import { CascadeQ } from 'cascade-q';
import type { DecayCurve } from 'cascade-q/types';

// Configure how task priorities decay over time
const queue = new CascadeQ({
  baseDecay: 0.5, // Priority increases by 0.5 per time unit
  decayCurve: (n: number): number => n, // Linear decay
  priorityDecayInterval: 60000 // Calculate decay every minute
});

// Exponential decay example (accelerated priority boost)
const exponentialDecay: DecayCurve = (n: number): number => Math.pow(n, 2);
const queue2 = new CascadeQ({
  decayCurve: exponentialDecay
});
```

### **Concurrency Control Mechanism**

CascadeQ provides two levels of concurrency management:

- **Global concurrency control** - Limits total concurrency via `maxConcurrency`
- **Queue-level concurrency allocation** - Distributes concurrency quotas among different priority queues via `calcConcurrency`

```tsx
import { CascadeQ } from 'cascade-q';
import type { CalcConcurrency, CascadeQState } from 'cascade-q/types';

// Custom concurrency allocation strategy
// *Note: This is a simplified example, actual applications should consider total concurrency limits and more queues
const customConcurrencyStrategy: CalcConcurrency = (index: number, state: CascadeQState): number => {
  if (pending === 0 || queues[index].pending === 0) return 0;
  // High priority queue(index=0) gets more concurrency quota
  if (index === 0) return Math.min(8, state.queues[0].pending);
  // Low priority queues get at most 2 concurrent tasks each
  return Math.min(2, state.queues[index].pending);
};

const queue = new CascadeQ({
  thresholds: [0, 10]
  maxConcurrency: 10, // Global maximum concurrency
  calcConcurrency: customConcurrencyStrategy
});
```

### Default Concurrency Strategy

CascadeQ's default concurrency allocation strategy adopts a "two-phase weighted allocation" principle, dynamically adjusting concurrent resources based on queue priority and task count to ensure efficient system resource utilization:

```tsx
// Default concurrency calculation strategy
const DEFAULT_CALC_CONCURRENCY: CalcConcurrency = (index: number, { max, pending, queues }: CascadeQState): number => {
  // Phase 1: Base calculation
  if (pending === 0 || queues[index].pending === 0) return 0;

  const totalLevels = queues.length;
  const levelWeight = (totalLevels - index) / totalLevels;
  let levelShare = Math.ceil((max * levelWeight * queues[index].pending) / pending);
  levelShare = Math.min(levelShare, queues[index].pending);

  // Phase 2: Ensure high-priority queues get sufficient resources
  if (index === 0 && levelShare < queues[0].pending) {
    levelShare = Math.min(Math.ceil(max * 0.6), queues[0].pending);
  }

  return levelShare;
};
```

#### **Strategy Features**

- **Priority Weighting** - Higher priority queues get higher weights, e.g., in a three-level queue system, the highest priority queue gets 100% weight, medium priority gets 66.7%, and low priority gets 33.3%
- **Demand-based Allocation** - Considers task count in each queue, allocating concurrent resources proportionally based on task distribution
- **High Priority Guarantee** - Ensures high-priority queues get at least 60% of concurrent resources (if needed)
- **Dynamic Adjustment** - Automatically recalculates optimal concurrency allocation as tasks execute and are added
- **Maximum Resource Utilization** - Uses ceiling rather than floor functions to ensure concurrent resources are fully utilized
- **Fine-grained Control** - Precisely calculates the actual demand for each queue without forcing allocation of unnecessary concurrency quotas

## **Configuration Options**

| Option                  | Type                           | Default                                           | Description                                                          |
| ----------------------- | ------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------- |
| `maxConcurrency`        | `number`                       | `10`                                              | Maximum concurrent task count                                        |
| `thresholds`            | `Array<number\|ThresholdItem>` | `[0, 10]`                                         | Priority queue threshold configuration [Full config](#thresholditem) |
| `baseDecay`             | `number`                       | `0.5`                                             | Base priority decay rate                                             |
| `decayCurve`            | `DecayCurve`                   | `n => n`                                          | Priority decay curve function                                        |
| `priorityDecayInterval` | `number`                       | `60000`                                           | Priority decay calculation interval (ms)                             |
| `calcConcurrency`       | `CalcConcurrency`              | [Default strategy](#default-concurrency-strategy) | Queue concurrency quota allocation algorithm                         |
| `taskTTL`               | `number`                       | `60000`                                           | Maximum task lifetime (ms)                                           |
| `cleanupInterval`       | `number`                       | `60000`                                           | Expired task cleanup interval (ms)                                   |
| `priorityCheckInterval` | `number`                       | `10000`                                           | Priority check interval (ms)                                         |

### `ThresholdItem`

| Property | Type     | Description                                                                            |
| -------- | -------- | -------------------------------------------------------------------------------------- |
| `value`  | `number` | Priority threshold, tasks with basePriority ≤ value will be assigned to the queue      |
| `name?`  | `string` | Optional queue name, used to identify the queue for state queries and logging purposes |

## **API Reference**

### **Queue Operation Methods**

| Method     | Parameters                                  | Return Value    | Description                                                           |
| ---------- | ------------------------------------------- | --------------- | --------------------------------------------------------------------- |
| `add<T>`   | `task: () => Promise<T>, priority?: number` | `TaskHandle<T>` | Add an async task to the queue, returns a task control handle         |
| `pause`    | None                                        | `void`          | Pause queue scheduling, running tasks continue, new tasks won't start |
| `resume`   | None                                        | `void`          | Resume queue scheduling                                               |
| `cancel`   | `taskId: symbol`                            | `boolean`       | Cancel a specific task, returns `true` on success                     |
| `clear`    | None                                        | `void`          | Clear all pending tasks                                               |
| `getState` | None                                        | `CascadeQState` | Get current queue state information                                   |
| `dispose`  | None                                        | `void`          | Release queue resources, clean up timers, queue becomes unusable      |

### **Event Listening Methods**

| Method | Parameters                                                            | Return Value | Description           |
| ------ | --------------------------------------------------------------------- | ------------ | --------------------- |
| `on`   | `event: QueueEvent, handler: (task: TaskItem, error?: Error) => void` | `void`       | Add event listener    |
| `off`  | `event: QueueEvent, handler: (task: TaskItem, error?: Error) => void` | `void`       | Remove event listener |

### **TaskHandle Methods**

| Method      | Parameters                  | Return Value       | Description                                                      |
| ----------- | --------------------------- | ------------------ | ---------------------------------------------------------------- |
| `cancel`    | None                        | `boolean`          | Cancel task (only in `pending` state), returns `true` on success |
| `getStatus` | None                        | `TaskStatus`       | Get current task status                                          |
| `then`      | `onfulfilled?, onrejected?` | `Promise<unknown>` | `Promise` interface, supports waiting for task completion        |
| `catch`     | `onrejected`                | `Promise<unknown>` | `Promise` interface, catch task errors                           |
| `finally`   | `onfinally`                 | `Promise<unknown>` | `Promise` interface, executes regardless of success or failure   |

## `QueueEvent`

| Event Name | Callback Parameters | Triggered When                                 |
| ---------- | ------------------- | ---------------------------------------------- |
| `enqueue`  | `TaskItem`          | Task is added to the queue                     |
| `start`    | `TaskItem`          | Task starts execution                          |
| `success`  | `TaskItem`          | Task completes successfully                    |
| `fail`     | `TaskItem, Error`   | Task execution fails                           |
| `complete` | `TaskItem`          | Task completes (regardless of success/failure) |
| `cancel`   | `TaskItem`          | Task is cancelled                              |

## **Status Definitions**

### **`TaskStatus`**

| Status      | Description                  |
| ----------- | ---------------------------- |
| `Pending`   | Task is waiting in the queue |
| `Running`   | Task is currently executing  |
| `Success`   | Task completed successfully  |
| `Failed`    | Task execution failed        |
| `Cancelled` | Task was cancelled           |

### **`CascadeQState`**

| Property  | Type     | Description                           |
| --------- | -------- | ------------------------------------- |
| `running` | `number` | Current number of executing tasks     |
| `pending` | `number` | Current number of waiting tasks       |
| `max`     | `number` | Maximum concurrent task count         |
| `queues`  | `array`  | Detailed state of each priority queue |

### `state.queues[index]`

| Property      | Type             | Description                              |
| ------------- | ---------------- | ---------------------------------------- |
| `level`       | `number\|string` | Queue's priority threshold or identifier |
| `concurrency` | `number`         | Current concurrency quota for this queue |
| `running`     | `number`         | Number of tasks executing in this queue  |
| `pending`     | `number`         | Number of tasks waiting in this queue    |

## **License**

[MIT](./LICENSE)
