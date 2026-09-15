import { Store } from '@/application/store';
import {
  type DiscoveredConnector,
  discoveredConnectorFrom,
} from '@/domain/discovery/discovered-connector';
import {
  AVIONIX_SERVICE_TYPE,
  type BrowsedService,
  type ServiceBrowser,
  type ServiceBrowserAvailability,
  type ServiceBrowserListener,
} from '@/domain/discovery/service-browser';
import type { AvionixError } from '@/domain/errors/avionix-error';
import type { Logger } from '@/infrastructure/logging/logger';

export interface DiscoverySnapshot {
  availability: ServiceBrowserAvailability;
  scanning: boolean;
  /** Sorted by name, one entry per DNS-SD instance name. */
  connectors: DiscoveredConnector[];
  error: AvionixError | null;
}

function byName(a: DiscoveredConnector, b: DiscoveredConnector): number {
  return a.name.localeCompare(b.name);
}

/**
 * Owns the list of Avionix Connectors seen on the network. `start()` and `stop()` are
 * idempotent; every browser callback checks the generation it was created for, so an event
 * that arrives after `stop()` (or after an error ended the browse) is dropped.
 */
export class ConnectorDiscovery {
  readonly store: Store<DiscoverySnapshot>;
  private generation = 0;
  private stopBrowse: (() => void) | null = null;

  constructor(private readonly deps: { browser: ServiceBrowser; logger: Logger }) {
    this.store = new Store<DiscoverySnapshot>({
      availability: deps.browser.availability,
      scanning: false,
      connectors: [],
      error: null,
    });
  }

  start(): void {
    if (this.stopBrowse !== null || this.deps.browser.availability !== 'available') {
      return;
    }
    const generation = ++this.generation;
    this.store.setState((prev) => ({ ...prev, scanning: true, error: null }));
    const listener: ServiceBrowserListener = {
      resolved: (service) => {
        if (generation === this.generation) {
          this.upsert(service);
        }
      },
      removed: (name) => {
        if (generation === this.generation) {
          this.remove(name);
        }
      },
      error: (error) => {
        if (generation !== this.generation) {
          return;
        }
        this.generation += 1;
        this.releaseBrowse();
        this.store.setState((prev) => ({ ...prev, scanning: false, error }));
      },
    };
    const stop = this.deps.browser.browse(AVIONIX_SERVICE_TYPE, listener);
    if (generation === this.generation) {
      this.stopBrowse = stop;
    } else {
      // The browser reported an error synchronously inside browse(); the error handler already
      // moved the generation on, so this browse is over before it was recorded.
      stop();
    }
  }

  stop(): void {
    const prev = this.store.getSnapshot();
    if (this.stopBrowse === null && !prev.scanning && prev.connectors.length === 0) {
      return;
    }
    this.generation += 1;
    this.releaseBrowse();
    // Cleared on purpose: a PC that went away while the app was in the background must not be
    // shown as present when the app comes back. Guarding on state rather than the handle means
    // an error that already cleared `stopBrowse` still gets the stale list cleared here.
    this.store.setState((s) => ({ ...s, scanning: false, connectors: [] }));
  }

  private releaseBrowse(): void {
    const stop = this.stopBrowse;
    this.stopBrowse = null;
    if (stop !== null) {
      stop();
    }
  }

  private upsert(service: BrowsedService): void {
    const connector = discoveredConnectorFrom(service);
    if (connector === null) {
      this.deps.logger.warn('discovered service has no usable host', { name: service.name });
      return;
    }
    this.store.setState((prev) => ({
      ...prev,
      connectors: [...prev.connectors.filter((c) => c.name !== connector.name), connector].sort(
        byName,
      ),
    }));
  }

  private remove(name: string): void {
    this.store.setState((prev) =>
      prev.connectors.some((c) => c.name === name)
        ? { ...prev, connectors: prev.connectors.filter((c) => c.name !== name) }
        : prev,
    );
  }
}
