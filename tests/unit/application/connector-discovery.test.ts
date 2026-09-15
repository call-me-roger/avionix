import { ConnectorDiscovery } from '@/application/connector-discovery';
import type { BrowsedService } from '@/domain/discovery/service-browser';
import { AvionixError } from '@/domain/errors/avionix-error';
import { createMemorySink, createLogger, silentLogger } from '@/infrastructure/logging/logger';
import { createFakeServiceBrowser } from '../../support/fake-service-browser';

function service(name: string, overrides: Partial<BrowsedService> = {}): BrowsedService {
  return {
    name,
    host: `${name}.local.`,
    port: 8080,
    addresses: ['192.168.1.20'],
    txt: { v: '1', pairing: '1' },
    ...overrides,
  };
}

function setup(browser = createFakeServiceBrowser(), logger = silentLogger) {
  const discovery = new ConnectorDiscovery({ browser, logger });
  return { browser, discovery };
}

describe('ConnectorDiscovery', () => {
  it('starts idle with the browser availability', () => {
    const { discovery } = setup(createFakeServiceBrowser('needsDevBuild'));
    expect(discovery.store.getSnapshot()).toEqual({
      availability: 'needsDevBuild',
      scanning: false,
      connectors: [],
      error: null,
    });
  });

  it('start browses the avionix type once and sets scanning', () => {
    const { browser, discovery } = setup();
    discovery.start();
    discovery.start();
    expect(browser.browseCalls).toHaveLength(1);
    expect(browser.browseCalls[0]?.type).toBe('avionix');
    expect(discovery.store.getSnapshot().scanning).toBe(true);
  });

  it('does nothing when the browser is not available', () => {
    const { browser, discovery } = setup(createFakeServiceBrowser('unsupported'));
    discovery.start();
    expect(browser.browseCalls).toHaveLength(0);
    expect(discovery.store.getSnapshot().scanning).toBe(false);
    discovery.stop();
    expect(browser.stopCalls).toBe(0);
  });

  it('lists resolved services sorted by name and replaces a re-resolved one', () => {
    const { browser, discovery } = setup();
    discovery.start();
    browser.listener().resolved(service('Zulu'));
    browser.listener().resolved(service('alpha', { addresses: ['10.0.0.2'] }));
    browser.listener().resolved(service('Zulu', { port: 9090, txt: { pairing: '0' } }));
    expect(discovery.store.getSnapshot().connectors).toEqual([
      { name: 'alpha', host: '10.0.0.2', port: 8080, pairingRequired: true },
      { name: 'Zulu', host: '192.168.1.20', port: 9090, pairingRequired: false },
    ]);
  });

  it('removes a connector by name and ignores unknown names', () => {
    const { browser, discovery } = setup();
    discovery.start();
    browser.listener().resolved(service('alpha'));
    const before = discovery.store.getSnapshot();
    browser.listener().removed('nobody');
    expect(discovery.store.getSnapshot()).toBe(before);
    browser.listener().removed('alpha');
    expect(discovery.store.getSnapshot().connectors).toEqual([]);
  });

  it('skips a service without a usable host and logs it', () => {
    const sink = createMemorySink();
    const { browser, discovery } = setup(
      createFakeServiceBrowser(),
      createLogger('discovery', { sink }),
    );
    discovery.start();
    browser.listener().resolved(service('ghost', { addresses: ['fe80::1'], host: '' }));
    expect(discovery.store.getSnapshot().connectors).toEqual([]);
    expect(sink.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('stop stops the browse, clears the list and ignores late events', () => {
    const { browser, discovery } = setup();
    discovery.start();
    const listener = browser.listener();
    listener.resolved(service('alpha'));
    discovery.stop();
    discovery.stop();
    expect(browser.stopCalls).toBe(1);
    expect(discovery.store.getSnapshot()).toMatchObject({ scanning: false, connectors: [] });
    listener.resolved(service('late'));
    listener.error(new AvionixError({ code: 'DISCOVERY_ERROR', message: 'late' }));
    expect(discovery.store.getSnapshot()).toMatchObject({ connectors: [], error: null });
  });

  it('records an error, stops scanning, keeps the list and clears the error on restart', () => {
    const { browser, discovery } = setup();
    discovery.start();
    browser.listener().resolved(service('alpha'));
    const error = new AvionixError({ code: 'DISCOVERY_ERROR', message: 'NSD failed' });
    browser.listener().error(error);
    expect(browser.stopCalls).toBe(1);
    expect(discovery.store.getSnapshot()).toMatchObject({
      scanning: false,
      error,
      connectors: [{ name: 'alpha' }],
    });
    discovery.start();
    expect(browser.browseCalls).toHaveLength(2);
    expect(discovery.store.getSnapshot()).toMatchObject({ scanning: true, error: null });
  });

  it('handles an error reported synchronously inside browse', () => {
    const error = new AvionixError({ code: 'DISCOVERY_ERROR', message: 'scan threw' });
    const { browser, discovery } = setup(
      createFakeServiceBrowser('available', { failOnBrowse: error }),
    );
    discovery.start();
    expect(discovery.store.getSnapshot()).toMatchObject({ scanning: false, error });
    expect(browser.stopCalls).toBe(1);
    discovery.start();
    expect(browser.browseCalls).toHaveLength(2);
  });

  it('a restart after stop uses a fresh browse', () => {
    const { browser, discovery } = setup();
    discovery.start();
    discovery.stop();
    discovery.start();
    expect(browser.browseCalls).toHaveLength(2);
    browser.listener().resolved(service('alpha'));
    expect(discovery.store.getSnapshot().connectors).toHaveLength(1);
  });
});
