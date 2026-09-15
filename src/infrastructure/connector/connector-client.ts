import type { ConnectorInfo } from '@/domain/connector/connector-info';
import { isAvionixError } from '@/domain/errors/avionix-error';
import { connectorInfoSchema, pairResponseSchema } from '@/infrastructure/connector/schemas';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';

export const CONNECTOR_INFO_PATH = '/avionix/info';
export const CONNECTOR_PAIR_PATH = '/avionix/pair';

export interface ConnectorClientOptions {
  http: HttpTransport;
  logger?: Logger;
}

/**
 * Speaks the public part of the Avionix Connector protocol. Everything else (the relayed
 * X-Plane API) goes through `HttpTransport` and `XPlaneClient` as before.
 */
export class ConnectorClient {
  private readonly http: HttpTransport;
  private readonly logger: Logger;

  constructor(options: ConnectorClientOptions) {
    this.http = options.http;
    this.logger = options.logger ?? silentLogger;
  }

  /**
   * Returns null when the target is not an Avionix Connector: a 404 (X-Plane itself, which
   * has no /avionix route) or a body that is not connector info (an HTML page, another
   * server's JSON). Every other failure propagates so an unreachable host still fails the
   * connect with NETWORK_ERROR and a blocked one still reports INCOMING_TRAFFIC_DISABLED.
   */
  async getInfo(): Promise<ConnectorInfo | null> {
    try {
      const info = await this.http.request({
        method: 'GET',
        path: CONNECTOR_INFO_PATH,
        schema: connectorInfoSchema,
      });
      this.logger.info('connector detected', {
        name: info.name,
        version: info.version,
        pairingRequired: info.pairingRequired,
      });
      return info;
    } catch (error) {
      if (!isAvionixError(error)) {
        throw error;
      }
      if (error.code === 'INVALID_RESPONSE' || error.httpStatus === 404) {
        this.logger.debug('no Avionix Connector here, treating the target as X-Plane');
        return null;
      }
      throw error;
    }
  }

  /**
   * Exchanges the six-digit code for a bearer token. Rejects with PAIRING_FAILED,
   * PAIRING_RATE_LIMITED or another AvionixError; the token is returned, never logged.
   */
  async pair(code: string): Promise<string> {
    const response = await this.http.request({
      method: 'POST',
      path: CONNECTOR_PAIR_PATH,
      body: { code },
      schema: pairResponseSchema,
    });
    this.logger.info('paired with the connector');
    return response.token;
  }
}
