/**
 * @author EE_Azura <EE_Azura@outlook.com>
 */

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
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
      if (eventHandlers.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  emit(event: QueueEvent, task: TaskItem, error?: Error): void {
    this.handlers.get(event)?.forEach(handler => handler(task, error));
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}
