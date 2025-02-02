import { TaskItem, QueueEvent, EventHandler } from './types';

export class EventEmitter {
  private handlers = new Map<QueueEvent, Set<EventHandler>>();

  on(event: QueueEvent, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: QueueEvent, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: QueueEvent, task: TaskItem): void {
    this.handlers.get(event)?.forEach(handler => handler(task));
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}
