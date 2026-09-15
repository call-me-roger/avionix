import { createMemorySink, createLogger, silentLogger } from '@/infrastructure/logging/logger';
import {
  type ZeroconfEventHandler,
  type ZeroconfEventName,
  type ZeroconfLike,
  createZeroconfServiceBrowser,
} from '@/infrastructure/discovery/zeroconf-service-browser';

class FakeZeroconf implements ZeroconfLike {
  scanCalls: unknown[][] = [];
  stopCalls: unknown[][] = [];
  deviceListenersRemoved = 0;
  private readonly handlers = new Map<ZeroconfEventName, Set<ZeroconfEventHandler>>();
  scanError: Error | null = null;
  stopError: Error | null = null;

  scan(type: string, protocol: string, domain: string, implType: 'NSD' | 'DNSSD'): void {
    this.scanCalls.push([type, protocol, domain, implType]);
    if (this.scanError !== null) {
      throw this.scanError;
    }
  }

  stop(implType: 'NSD' | 'DNSSD'): void {
    this.stopCalls.push([implType]);
    if (this.stopError !== null) {
      throw this.stopError;
    }
  }

  on(event: ZeroconfEventName, handler: ZeroconfEventHandler): this {
    const set = this.handlers.get(event) ?? new Set<ZeroconfEventHandler>();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  removeListener(event: ZeroconfEventName, handler: ZeroconfEventHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeDeviceListeners(): void {
    this.deviceListenersRemoved += 1;
  }

  listenerCount(event: ZeroconfEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  emit(event: ZeroconfEventName, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

function setup(logger = silentLogger) {
  const zeroconf = new FakeZeroconf();
  const browser = createZeroconfServiceBrowser({ createZeroconf: () => zeroconf, logger });
  const listener = { resolved: jest.fn(), removed: jest.fn(), error: jest.fn() };
  return { zeroconf, browser, listener };
}

const payload = {
  name: 'Avionix Connector (sim-pc)',
  fullName: 'Avionix Connector (sim-pc)._avionix._tcp.local.',
  host: 'sim-pc.local.',
  port: 8080,
  addresses: ['192.168.1.20'],
  txt: { v: '1', pairing: '1' },
};

describe('createZeroconfServiceBrowser', () => {
  it('is available and scans the bare type over tcp in local. with NSD', () => {
    const { zeroconf, browser, listener } = setup();
    expect(browser.availability).toBe('available');
    browser.browse('avionix', listener);
    expect(zeroconf.scanCalls).toEqual([['avionix', 'tcp', 'local.', 'NSD']]);
  });

  it('forwards a valid resolved payload as a BrowsedService without the extra keys', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', payload);
    expect(listener.resolved).toHaveBeenCalledWith({
      name: payload.name,
      host: 'sim-pc.local.',
      port: 8080,
      addresses: ['192.168.1.20'],
      txt: { v: '1', pairing: '1' },
    });
  });

  it('defaults missing addresses and host, and drops only the non-string txt entries', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', { name: 'a', port: 8080, txt: { pairing: '1', weird: 1 } });
    expect(listener.resolved).toHaveBeenCalledWith({
      name: 'a',
      host: '',
      port: 8080,
      addresses: [],
      txt: { pairing: '1' },
    });
  });

  it('defaults txt to empty when the whole value is not a record', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', { name: 'a', port: 8080, txt: 'nonsense' });
    expect(listener.resolved).toHaveBeenCalledWith(expect.objectContaining({ name: 'a', txt: {} }));
  });

  it('drops a malformed payload with a warning', () => {
    const sink = createMemorySink();
    const { zeroconf, browser, listener } = setup(createLogger('discovery', { sink }));
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', { name: '', port: 8080 });
    zeroconf.emit('resolved', { name: 'a', port: 0 });
    zeroconf.emit('resolved', 'nonsense');
    zeroconf.emit('resolved', null);
    expect(listener.resolved).not.toHaveBeenCalled();
    expect(sink.entries.filter((entry) => entry.level === 'warn')).toHaveLength(4);
  });

  it('forwards removals by name and ignores non-string removals', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('remove', 'Avionix Connector (sim-pc)');
    zeroconf.emit('remove', { name: 'x' });
    zeroconf.emit('remove', '');
    expect(listener.removed).toHaveBeenCalledTimes(1);
    expect(listener.removed).toHaveBeenCalledWith('Avionix Connector (sim-pc)');
  });

  it('wraps library errors as DISCOVERY_ERROR with the cause attached', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    const cause = new Error('NSD failed');
    zeroconf.emit('error', cause);
    expect(listener.error).toHaveBeenCalledTimes(1);
    const error = listener.error.mock.calls[0]?.[0];
    expect(error?.code).toBe('DISCOVERY_ERROR');
    expect(error?.retryable).toBe(false);
    expect(error?.cause).toBe(cause);
    expect(error?.message).toBe('Connector discovery failed: NSD failed');
  });

  it('stop is idempotent, stops the scan once and removes every listener', () => {
    const { zeroconf, browser, listener } = setup();
    const stop = browser.browse('avionix', listener);
    stop();
    stop();
    expect(zeroconf.stopCalls).toEqual([['NSD']]);
    expect(zeroconf.deviceListenersRemoved).toBe(1);
    expect(zeroconf.listenerCount('resolved')).toBe(0);
    expect(zeroconf.listenerCount('remove')).toBe(0);
    expect(zeroconf.listenerCount('error')).toBe(0);
    zeroconf.emit('resolved', payload);
    expect(listener.resolved).not.toHaveBeenCalled();
  });

  it('reports a throwing scan as DISCOVERY_ERROR and leaves nothing attached', () => {
    const { zeroconf, browser, listener } = setup();
    zeroconf.scanError = new Error('RNZeroconf.scan is not a function');
    const stop = browser.browse('avionix', listener);
    expect(listener.error).toHaveBeenCalledTimes(1);
    expect(listener.error.mock.calls[0]?.[0]?.code).toBe('DISCOVERY_ERROR');
    expect(zeroconf.listenerCount('resolved')).toBe(0);
    expect(() => stop()).not.toThrow();
    expect(zeroconf.stopCalls).toHaveLength(1);
  });

  it('swallows a throwing stop and still detaches', () => {
    const sink = createMemorySink();
    const { zeroconf, browser, listener } = setup(createLogger('discovery', { sink }));
    zeroconf.stopError = new Error('boom');
    const stop = browser.browse('avionix', listener);
    expect(() => stop()).not.toThrow();
    expect(zeroconf.deviceListenersRemoved).toBe(1);
    expect(sink.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('reports a factory that throws as DISCOVERY_ERROR', () => {
    const listener = { resolved: jest.fn(), removed: jest.fn(), error: jest.fn() };
    const browser = createZeroconfServiceBrowser({
      createZeroconf: () => {
        throw new Error('no native module');
      },
      logger: silentLogger,
    });
    const stop = browser.browse('avionix', listener);
    expect(listener.error.mock.calls[0]?.[0]?.code).toBe('DISCOVERY_ERROR');
    expect(() => stop()).not.toThrow();
  });
});
