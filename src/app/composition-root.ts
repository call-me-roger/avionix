import type { AppServices } from '@/app/services-context';
import { SimulatorSession } from '@/application/simulator-session';
import { httpOrigin } from '@/domain/connection/endpoints';
import { createLogger } from '@/infrastructure/logging/logger';
import { createAsyncStorageSettings } from '@/infrastructure/storage/async-storage-settings';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';

export function createAppServices(): AppServices {
  const session = new SimulatorSession({
    createHttpTransport: (config) =>
      new HttpTransport({
        origin: httpOrigin(config),
        logger: createLogger('http'),
      }),
    createClient: (config, apiVersion, http) =>
      new XPlaneClient({ config, apiVersion, http, logger: createLogger('websocket') }),
    logger: createLogger('session'),
  });
  return { session, settingsStorage: createAsyncStorageSettings() };
}
