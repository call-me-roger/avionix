import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorCapabilities } from '@/domain/simulator/types';

export type ApiVersion = 'v1' | 'v2' | 'v3';

export const API_VERSIONS: readonly ApiVersion[] = ['v1', 'v2', 'v3'];

export const AVIONIX_SUPPORTED_API_VERSIONS: readonly ApiVersion[] = ['v2', 'v3'];

export const MINIMUM_XPLANE_VERSION = '12.1.4';

export function isApiVersion(value: string): value is ApiVersion {
  return (API_VERSIONS as readonly string[]).includes(value);
}

function rank(version: ApiVersion): number {
  return API_VERSIONS.indexOf(version);
}

export function negotiateApiVersion(
  capabilities: SimulatorCapabilities,
  supported: readonly ApiVersion[] = AVIONIX_SUPPORTED_API_VERSIONS,
): ApiVersion {
  const common = capabilities.supportedApiVersions.filter((version) => supported.includes(version));
  const best = common.sort((a, b) => rank(b) - rank(a))[0];
  if (best === undefined) {
    throw new AvionixError({
      code: 'UNSUPPORTED_API',
      message:
        `X-Plane ${capabilities.simulatorVersion} offers API versions ` +
        `[${capabilities.rawApiVersions.join(', ')}] but Avionix needs one of ` +
        `[${supported.join(', ')}]. X-Plane ${MINIMUM_XPLANE_VERSION} or newer is required.`,
    });
  }
  return best;
}
