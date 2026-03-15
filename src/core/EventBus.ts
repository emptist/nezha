// EventBus provides pub/sub event handling for the system

type EventHandler = (data: unknown) => void;

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  subscribe(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  unsubscribe(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  publish(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  clear(): void {
    this.handlers.clear();
  }
}
