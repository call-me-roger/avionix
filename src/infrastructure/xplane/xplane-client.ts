import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import { restPath, webSocketUrl } from '@/domain/connection/endpoints';
import { AvionixError, type AvionixErrorCode, toAvionixError } from '@/domain/errors/avionix-error';
import type { ApiVersion } from '@/domain/simulator/api-version';
import type {
  SimulatorClient,
  SocketCloseInfo,
  Unsubscribe,
} from '@/domain/simulator/simulator-client';
import type {
  CommandDescriptor,
  DataRefDescriptor,
  DataRefSubscription,
  DataRefUpdate,
  DataRefValue,
  SimulatorCapabilities,
} from '@/domain/simulator/types';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { type AuthProvider, appendTokenQuery, noAuth } from '@/infrastructure/xplane/auth';
import { probeCapabilities } from '@/infrastructure/xplane/capabilities';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { toCommandDescriptor, toDataRefDescriptor } from '@/infrastructure/xplane/schemas/mappers';
import {
  commandListResponseSchema,
  countResponseSchema,
  dataRefListResponseSchema,
  dataRefValueResponseSchema,
} from '@/infrastructure/xplane/schemas/rest';
import {
  type WebSocketFactory,
  WebSocketTransport,
} from '@/infrastructure/xplane/websocket/websocket-transport';

export interface XPlaneClientOptions {
  config: XPlaneConnectionConfig;
  apiVersion: ApiVersion;
  http: HttpTransport;
  createSocket?: WebSocketFactory;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
  logger?: Logger;
  /** Supplies the connector bearer token for the WebSocket upgrade, read at connect time. */
  auth?: AuthProvider;
}

function wrap(error: unknown, code: AvionixErrorCode, message: string): AvionixError {
  const inner = toAvionixError(error, { code: 'UNKNOWN', message });
  if (inner.code === 'UNAUTHORIZED') {
    // The connector refused the request before the operation could fail on its own terms.
    // Reporting it as WRITE_FAILED would hide the one thing the session can act on: the
    // token is gone and the device has to pair again.
    return inner;
  }
  return new AvionixError({
    code,
    message: `${message}: ${inner.message}`,
    retryable: inner.retryable,
    simulatorErrorCode: inner.simulatorErrorCode,
    httpStatus: inner.httpStatus,
    cause: inner,
  });
}

export class XPlaneClient implements SimulatorClient {
  readonly apiVersion: ApiVersion;
  private readonly http: HttpTransport;
  private readonly logger: Logger;
  private socket: WebSocketTransport | null = null;
  private connecting: Promise<void> | null = null;
  private readonly dataRefListeners = new Set<(updates: DataRefUpdate[]) => void>();
  private readonly closeListeners = new Set<(info: SocketCloseInfo) => void>();

  constructor(private readonly options: XPlaneClientOptions) {
    this.apiVersion = options.apiVersion;
    this.http = options.http;
    this.logger = options.logger ?? silentLogger;
  }

  getCapabilities(): Promise<SimulatorCapabilities> {
    return probeCapabilities(this.http);
  }

  async findDataRef(name: string): Promise<DataRefDescriptor | null> {
    try {
      const response = await this.http.request({
        method: 'GET',
        path: restPath(this.apiVersion, '/datarefs'),
        query: { 'filter[name]': name },
        schema: dataRefListResponseSchema,
      });
      const match = response.data.find((item) => item.name === name);
      return match === undefined ? null : toDataRefDescriptor(match);
    } catch (error) {
      if (error instanceof AvionixError && error.code === 'DATAREF_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async findCommand(name: string): Promise<CommandDescriptor | null> {
    try {
      const response = await this.http.request({
        method: 'GET',
        path: restPath(this.apiVersion, '/commands'),
        query: { 'filter[name]': name },
        schema: commandListResponseSchema,
      });
      const match = response.data.find((item) => item.name === name);
      return match === undefined ? null : toCommandDescriptor(match);
    } catch (error) {
      if (error instanceof AvionixError && error.code === 'COMMAND_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async getDataRefCount(): Promise<number> {
    const response = await this.http.request({
      method: 'GET',
      path: restPath(this.apiVersion, '/datarefs/count'),
      schema: countResponseSchema,
    });
    return response.data;
  }

  async getDataRefValue(id: number, index?: number): Promise<DataRefValue> {
    const response = await this.http.request({
      method: 'GET',
      path: restPath(this.apiVersion, `/datarefs/${id}/value`),
      query: { index },
      schema: dataRefValueResponseSchema,
    });
    return response.data;
  }

  async setDataRefValue(id: number, value: DataRefValue, index?: number): Promise<void> {
    try {
      await this.http.request({
        method: 'PATCH',
        path: restPath(this.apiVersion, `/datarefs/${id}/value`),
        query: { index },
        body: { data: value },
      });
      this.logger.info('dataref written', { id, index });
    } catch (error) {
      throw wrap(error, 'WRITE_FAILED', `Writing dataref ${id} failed`);
    }
  }

  async activateCommand(id: number, durationSeconds = 0): Promise<void> {
    try {
      await this.http.request({
        method: 'POST',
        path: restPath(this.apiVersion, `/command/${id}/activate`),
        body: { duration: durationSeconds },
      });
      this.logger.info('command activated', { id, durationSeconds });
    } catch (error) {
      throw wrap(error, 'COMMAND_FAILED', `Activating command ${id} failed`);
    }
  }

  connectWebSocket(): Promise<void> {
    if (this.socket !== null && this.connecting === null) {
      return Promise.resolve();
    }
    if (this.connecting !== null) {
      return this.connecting;
    }
    const baseUrl = webSocketUrl(this.options.config, this.apiVersion);
    const token = (this.options.auth ?? noAuth)();
    const socket = new WebSocketTransport({
      url: token === null ? baseUrl : appendTokenQuery(baseUrl, token),
      createSocket: this.options.createSocket,
      connectTimeoutMs: this.options.connectTimeoutMs,
      requestTimeoutMs: this.options.requestTimeoutMs,
      logger: this.logger,
    });
    socket.onDataRefUpdate((updates) => {
      for (const listener of this.dataRefListeners) {
        listener(updates);
      }
    });
    socket.onClose((info) => {
      if (this.socket === socket) {
        this.socket = null;
      }
      for (const listener of this.closeListeners) {
        listener(info);
      }
    });
    this.socket = socket;
    this.connecting = socket
      .connect()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.socket = null;
        throw error;
      })
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  async subscribeDataRefs(subscriptions: DataRefSubscription[]): Promise<void> {
    try {
      await this.requireSocket().send('dataref_subscribe_values', { datarefs: subscriptions });
    } catch (error) {
      throw wrap(error, 'SUBSCRIPTION_FAILED', 'Subscribing to datarefs failed');
    }
  }

  async unsubscribeDataRefs(subscriptions: DataRefSubscription[] | 'all'): Promise<void> {
    try {
      await this.requireSocket().send('dataref_unsubscribe_values', { datarefs: subscriptions });
    } catch (error) {
      throw wrap(error, 'SUBSCRIPTION_FAILED', 'Unsubscribing from datarefs failed');
    }
  }

  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe {
    this.dataRefListeners.add(listener);
    return () => this.dataRefListeners.delete(listener);
  }

  onSocketClosed(listener: (info: SocketCloseInfo) => void): Unsubscribe {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  disconnectWebSocket(): void {
    this.socket?.close();
  }

  private requireSocket(): WebSocketTransport {
    if (this.socket === null || !this.socket.isOpen) {
      throw new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'WebSocket is not connected' });
    }
    return this.socket;
  }
}
