// TODO: Implement EventBus
// EventBus should provide pub/sub event handling for the system

type EventHandler = (data: unknown) => void;

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  subscribe(event: string, handler: EventHandler): void {
    // TODO: Implement subscribe
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  unsubscribe(event: string, handler: EventHandler): void {
    // TODO: Implement unsubscribe
    this.handlers.get(event)?.delete(handler);
  }

  publish(event: string, data: unknown): void {
    // TODO: Implement publish
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  clear(): void {
    // TODO: Implement clear
    this.handlers.clear();
  }
}
