import type {
  ServiceBrowser,
  ServiceBrowserAvailability,
} from '@/domain/discovery/service-browser';

/** A browser that finds nothing, tagged with the reason so the UI can explain itself. */
export function createNullServiceBrowser(
  availability: Exclude<ServiceBrowserAvailability, 'available'>,
): ServiceBrowser {
  return {
    availability,
    browse: () => () => undefined,
  };
}
