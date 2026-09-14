import { AvionixError, isAvionixError } from '@/domain/errors/avionix-error';
import { createLogger, createMemorySink } from '@/infrastructure/logging/logger';
import { RequestManager } from '@/infrastructure/xplane/websocket/request-manager';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : 'not avionix';
  }
}

function manager(defaultTimeoutMs = 5000) {
  const sink = createMemorySink();
  const logger = createLogger('websocket', { sink, minLevel: 'debug' });
  return { manager: new RequestManager({ defaultTimeoutMs, logger }), sink };
}

describe('RequestManager', () => {
  it('allocates increasing, never recycled ids starting at 1', () => {
    const { manager: m } = manager();
    expect(m.nextRequestId()).toBe(1);
    expect(m.nextRequestId()).toBe(2);
    expect(m.nextRequestId()).toBe(3);
  });

  it('resolves a pending request on a successful result', async () => {
    const { manager: m } = manager();
    const id = m.nextRequestId();
    const pending = m.register(id);
    expect(m.pendingCount).toBe(1);
    expect(m.settle({ req_id: id, type: 'result', success: true })).toBe(true);
    await expect(pending).resolves.toBeUndefined();
    expect(m.pendingCount).toBe(0);
  });

  it('rejects with a mapped simulator error on failure', async () => {
    const { manager: m } = manager();
    const id = m.nextRequestId();
    const pending = m.register(id);
    m.settle({
      req_id: id,
      type: 'result',
      success: false,
      error_code: 'invalid_dataref_id',
      error_message: 'nope',
    });
    await expect(pending).rejects.toMatchObject({
      code: 'DATAREF_NOT_FOUND',
      simulatorErrorCode: 'invalid_dataref_id',
    });
  });

  it('correlates concurrent requests independently of arrival order', async () => {
    const { manager: m } = manager();
    const a = m.nextRequestId();
    const b = m.nextRequestId();
    const pa = m.register(a);
    const pb = m.register(b);
    m.settle({ req_id: b, type: 'result', success: false, error_code: 'x' });
    m.settle({ req_id: a, type: 'result', success: true });
    await expect(pa).resolves.toBeUndefined();
    await expect(codeOf(pb)).resolves.toBe('SIMULATOR_ERROR');
  });

  it('ignores duplicate or unknown results and logs them', () => {
    const { manager: m, sink } = manager();
    const id = m.nextRequestId();
    void m.register(id).catch(() => undefined);
    expect(m.settle({ req_id: id, type: 'result', success: true })).toBe(true);
    expect(m.settle({ req_id: id, type: 'result', success: false, error_code: 'late' })).toBe(
      false,
    );
    expect(m.settle({ req_id: 999, type: 'result', success: true })).toBe(false);
    expect(sink.entries.some((e) => e.level === 'debug' && e.message.includes('unmatched'))).toBe(
      true,
    );
  });

  it('times out pending requests', async () => {
    jest.useFakeTimers();
    try {
      const { manager: m } = manager(1000);
      const id = m.nextRequestId();
      const pending = codeOf(m.register(id));
      await jest.advanceTimersByTimeAsync(1001);
      await expect(pending).resolves.toBe('TIMEOUT');
      expect(m.pendingCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejectAll rejects every pending request and clears timers', async () => {
    jest.useFakeTimers();
    try {
      const { manager: m } = manager(1000);
      const p1 = codeOf(m.register(m.nextRequestId()));
      const p2 = codeOf(m.register(m.nextRequestId()));
      m.rejectAll(new AvionixError({ code: 'CANCELLED', message: 'socket closed' }));
      await expect(p1).resolves.toBe('CANCELLED');
      await expect(p2).resolves.toBe('CANCELLED');
      expect(m.pendingCount).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
