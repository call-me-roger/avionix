import type { AppServices } from '@/app/services-context';
import { ConnectorDiscovery } from '@/application/connector-discovery';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { SimulatorSession } from '@/application/simulator-session';
import { httpOrigin } from '@/domain/connection/endpoints';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { createLogger } from '@/infrastructure/logging/logger';
import { createAsyncStorageSettings } from '@/infrastructure/storage/async-storage-settings';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { createPlatformServiceBrowser } from '@/platform/service-browser';

export function createAppServices(): AppServices {
  const settingsStorage = createAsyncStorageSettings();
  const session = new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: httpOrigin(config),
        auth,
        logger: createLogger('http'),
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({ config, apiVersion, http, auth, logger: createLogger('websocket') }),
    createConnectorClient: (http) =>
      new ConnectorClient({ http, logger: createLogger('connection') }),
    tokenStore: createPairingTokenStore(settingsStorage),
    logger: createLogger('session'),
  });
  const discoveryLogger = createLogger('discovery');
  const discovery = new ConnectorDiscovery({
    browser: createPlatformServiceBrowser(discoveryLogger),
    logger: discoveryLogger,
  });
  return { session, discovery, settingsStorage };
}
