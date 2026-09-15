import type {
  ServiceBrowser,
  ServiceBrowserAvailability,
  ServiceBrowserListener,
} from '@/domain/discovery/service-browser';
import type { AvionixError } from '@/domain/errors/avionix-error';

export interface FakeServiceBrowser extends ServiceBrowser {
  browseCalls: { type: string; listener: ServiceBrowserListener }[];
  stopCalls: number;
  /** The listener of the most recent browse that has not been stopped, or null. */
  readonly active: ServiceBrowserListener | null;
  /** Like `active`, but throws when nothing is browsing, so tests read as plain calls. */
  listener(): ServiceBrowserListener;
}

/**
 * Records `browse` and stop calls and hands the test the listener, so a test drives resolved,
 * removed and error events itself. `failOnBrowse` reports the error synchronously inside
 * `browse`, as the zeroconf adapter does when `scan()` throws.
 */
export function createFakeServiceBrowser(
  availability: ServiceBrowserAvailability = 'available',
  options: { failOnBrowse?: AvionixError } = {},
): FakeServiceBrowser {
  let active: ServiceBrowserListener | null = null;
  const fake: FakeServiceBrowser = {
    availability,
    browseCalls: [],
    stopCalls: 0,
    get active() {
      return active;
    },
    listener() {
      if (active === null) {
        throw new Error('no browse is active');
      }
      return active;
    },
    browse(type, listener) {
      fake.browseCalls.push({ type, listener });
      active = listener;
      if (options.failOnBrowse !== undefined) {
        listener.error(options.failOnBrowse);
      }
      return () => {
        fake.stopCalls += 1;
        if (active === listener) {
          active = null;
        }
      };
    },
  };
  return fake;
}
