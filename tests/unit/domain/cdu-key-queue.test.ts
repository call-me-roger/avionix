import { CDU_QUEUE_LIMIT, CduKeyQueue, type CduQueueEvent } from '@/domain/cdu/key-queue';
import type { ActivationResult } from '@/domain/panels/activation';

function deferred() {
  let resolve!: (result: ActivationResult) => void;
  const promise = new Promise<ActivationResult>((r) => (resolve = r));
  return { promise, resolve };
}

function harness() {
  const sent: string[] = [];
  const pending: ReturnType<typeof deferred>[] = [];
  const events: CduQueueEvent[] = [];
  let clock = 0;
  const queue = new CduKeyQueue(
    (key) => {
      sent.push(key);
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
    () => clock,
    (event) => events.push(event),
  );
  const settle = async (result: ActivationResult, after = 10) => {
    clock += after;
    pending.shift()?.resolve(result);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { queue, sent, events, settle };
}

describe('CduKeyQueue', () => {
  it('sends one key at a time, in press order, each once', async () => {
    const h = harness();
    ['key_K', 'key_L', 'key_A', 'key_X'].forEach((key) => h.queue.press(key));
    expect(h.sent).toEqual(['key_K']);
    await h.settle('ok');
    expect(h.sent).toEqual(['key_K', 'key_L']);
    await h.settle('ok');
    await h.settle('ok');
    await h.settle('ok');
    expect(h.sent).toEqual(['key_K', 'key_L', 'key_A', 'key_X']);
    expect(h.queue.size).toBe(0);
  });

  it('sends the same key twice when pressed twice', async () => {
    const h = harness();
    h.queue.press('key_L');
    h.queue.press('key_L');
    await h.settle('ok');
    await h.settle('ok');
    expect(h.sent).toEqual(['key_L', 'key_L']);
  });

  it('reports how long each key took', async () => {
    const h = harness();
    h.queue.press('exec');
    await h.settle('ok', 640);
    expect(h.events).toEqual([{ kind: 'sent', key: 'exec', elapsedMs: 640 }]);
  });

  it('drops the keys behind a failed one and says how many, with how long it took', async () => {
    const h = harness();
    ['key_K', 'key_L', 'key_A', 'key_X'].forEach((key) => h.queue.press(key));
    await h.settle('failed', 640);
    expect(h.sent).toEqual(['key_K']);
    expect(h.events).toEqual([
      { kind: 'failed', key: 'key_K', result: 'failed', dropped: 3, elapsedMs: 640 },
    ]);
    expect(h.queue.size).toBe(0);
  });

  it('treats a rejecting send as a failure instead of wedging the queue', async () => {
    const sent: string[] = [];
    const events: CduQueueEvent[] = [];
    const rejections: ((error: unknown) => void)[] = [];
    const queue = new CduKeyQueue(
      (key) =>
        new Promise<ActivationResult>((_resolve, reject) => {
          sent.push(key);
          rejections.push(reject);
        }),
      () => 0,
      (event) => events.push(event),
    );
    queue.press('key_K');
    queue.press('key_L');
    rejections.shift()?.(new Error('transport exploded'));
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual([
      { kind: 'failed', key: 'key_K', result: 'failed', dropped: 1, elapsedMs: 0 },
    ]);
    expect(queue.size).toBe(0);
    // Not wedged: a later press still sends.
    expect(queue.press('key_Z')).toBe(true);
    expect(sent).toEqual(['key_K', 'key_Z']);
  });

  it('refuses a press beyond the limit', () => {
    const h = harness();
    for (let i = 0; i < CDU_QUEUE_LIMIT; i += 1) {
      expect(h.queue.press('key_A')).toBe(true);
    }
    expect(h.queue.press('key_B')).toBe(false);
    expect(h.events).toEqual([{ kind: 'full' }]);
  });

  it('clear() drops waiting keys and silences the key in flight', async () => {
    const h = harness();
    ['key_K', 'key_L'].forEach((key) => h.queue.press(key));
    h.queue.clear();
    await h.settle('failed');
    expect(h.sent).toEqual(['key_K']);
    expect(h.events).toEqual([]);
    h.queue.press('key_Z');
    expect(h.sent).toEqual(['key_K', 'key_Z']);
  });
});
