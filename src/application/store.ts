export class Store<T> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  getSnapshot = (): T => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setState(updater: (prev: T) => T): void {
    const next = updater(this.state);
    if (Object.is(next, this.state)) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
