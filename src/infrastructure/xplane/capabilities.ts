import { capabilitiesPath } from '@/domain/connection/endpoints';
import { AvionixError, isAvionixError } from '@/domain/errors/avionix-error';
import { MINIMUM_XPLANE_VERSION } from '@/domain/simulator/api-version';
import type { SimulatorCapabilities } from '@/domain/simulator/types';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { toSimulatorCapabilities } from '@/infrastructure/xplane/schemas/mappers';
import { capabilitiesResponseSchema } from '@/infrastructure/xplane/schemas/rest';

export async function probeCapabilities(http: HttpTransport): Promise<SimulatorCapabilities> {
  try {
    const raw = await http.request({
      method: 'GET',
      path: capabilitiesPath(),
      schema: capabilitiesResponseSchema,
    });
    return toSimulatorCapabilities(raw);
  } catch (error) {
    if (
      isAvionixError(error) &&
      error.code === 'HTTP_ERROR' &&
      error.message.includes('HTTP 404')
    ) {
      throw new AvionixError({
        code: 'UNSUPPORTED_API',
        message:
          `X-Plane answered 404 for ${capabilitiesPath()}. This endpoint exists from X-Plane ` +
          `${MINIMUM_XPLANE_VERSION}; please update X-Plane.`,
        cause: error,
      });
    }
    throw error;
  }
}
