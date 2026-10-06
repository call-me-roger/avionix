import type { ActivationResult } from '@/domain/panels/activation';

/** One scratchpad line of keys may wait; more means the link cannot keep up (spec §4.5). */
export const CDU_QUEUE_LIMIT = 24;
/** An answer slower than this lights the SLOW annunciator (R6). */
export const SLOW_KEY_MS = 500;

export type CduQueueEvent =
  | { kind: 'sent'; key: string; elapsedMs: number }
  | {
      kind: 'failed';
      key: string;
      result: 'failed' | 'refused';
      dropped: number;
      elapsedMs: number;
    }
  | { kind: 'full' };

/**
 * Sends CDU key presses one at a time, in order (C2): "KLAX" typed quickly must never arrive as
 * "KLXA", which parallel requests could do. A failure drops the keys behind it — sending them would
 * enter a different string than the pilot typed.
 */
export class CduKeyQueue {
  private waiting: string[] = [];
  private running = false;
  private generation = 0;

  constructor(
    private readonly send: (key: string) => Promise<ActivationResult>,
    private readonly now: () => number,
    private readonly onEvent: (event: CduQueueEvent) => void,
  ) {}

  get size(): number {
    return this.waiting.length + (this.running ? 1 : 0);
  }

  press(key: string): boolean {
    if (this.size >= CDU_QUEUE_LIMIT) {
      this.onEvent({ kind: 'full' });
      return false;
    }
    this.waiting.push(key);
    if (!this.running) {
      void this.pump();
    }
    return true;
  }

  /** Link loss or a unit switch: forget what waits, and ignore the answer to what is in flight. */
  clear(): void {
    this.generation += 1;
    this.waiting = [];
    this.running = false;
  }

  private async pump(): Promise<void> {
    const generation = this.generation;
    this.running = true;
    while (this.waiting.length > 0 && generation === this.generation) {
      const key = this.waiting.shift() as string;
      const started = this.now();
      let result: ActivationResult;
      try {
        result = await this.send(key);
      } catch {
        // `activate` never rejects by contract (spec §4.5); treating a rejection as a failure
        // keeps the queue from wedging in `running` forever if that contract is ever broken.
        result = 'failed';
      }
      if (generation !== this.generation) {
        return;
      }
      if (result !== 'ok') {
        const dropped = this.waiting.length;
        this.waiting = [];
        this.onEvent({ kind: 'failed', key, result, dropped, elapsedMs: this.now() - started });
        break;
      }
      this.onEvent({ kind: 'sent', key, elapsedMs: this.now() - started });
    }
    if (generation === this.generation) {
      this.running = false;
    }
  }
}
