import { AvionixError } from '@/domain/errors/avionix-error';
import type { SocketCloseInfo, Unsubscribe } from '@/domain/simulator/simulator-client';
import type { DataRefUpdate } from '@/domain/simulator/types';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { urlWithoutQuery } from '@/infrastructure/xplane/auth';
import { toDataRefUpdates } from '@/infrastructure/xplane/schemas/mappers';
import {
  type OutgoingMessage,
  type OutgoingMessageType,
  commandUpdateMessageSchema,
  dataRefUpdateMessageSchema,
  incomingEnvelopeSchema,
  resultMessageSchema,
} from '@/infrastructure/xplane/schemas/websocket';
import { RequestManager } from '@/infrastructure/xplane/websocket/request-manager';

// Handler types are declared through method signatures so that both React Native's
// and Node's WebSocket implementations are assignable (method parameters are
// compared bivariantly, property function types are not).
export interface SocketCloseEvent {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}
export interface SocketMessageEvent {
  data: unknown;
}
type OpenHandler = { bivarianceHack(event: unknown): void }['bivarianceHack'];
type CloseHandler = { bivarianceHack(event: SocketCloseEvent): void }['bivarianceHack'];
type ErrorHandler = { bivarianceHack(event: unknown): void }['bivarianceHack'];
type MessageHandler = { bivarianceHack(event: SocketMessageEvent): void }['bivarianceHack'];

export interface WebSocketLike {
  readonly readyState: number;
  onopen: OpenHandler | null;
  onclose: CloseHandler | null;
  onerror: ErrorHandler | null;
  onmessage: MessageHandler | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export const defaultWebSocketFactory: WebSocketFactory = (url) => new WebSocket(url);

const READY_STATE_OPEN = 1;

export interface WebSocketTransportOptions {
  url: string;
  createSocket?: WebSocketFactory;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  logger?: Logger;
  now?: () => number;
}

export class WebSocketTransport {
  private socket: WebSocketLike | null = null;
  private readonly requests: RequestManager;
  private readonly logger: Logger;
  private readonly createSocket: WebSocketFactory;
  private readonly connectTimeoutMs: number;
  private readonly now: () => number;
  /** The URL without its query string: the query carries the connector token. */
  private readonly safeUrl: string;
  private closeRequested = false;
  private closeEmitted = false;
  private readonly dataRefListeners = new Set<(updates: DataRefUpdate[]) => void>();
  private readonly commandListeners = new Set<(updates: Record<string, boolean>) => void>();
  private readonly closeListeners = new Set<(info: SocketCloseInfo) => void>();

  constructor(private readonly options: WebSocketTransportOptions) {
    this.logger = options.logger ?? silentLogger;
    this.createSocket = options.createSocket ?? defaultWebSocketFactory;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.now = options.now ?? Date.now;
    this.safeUrl = urlWithoutQuery(options.url);
    this.requests = new RequestManager({
      defaultTimeoutMs: options.requestTimeoutMs ?? 5000,
      logger: this.logger,
    });
  }

  get isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === READY_STATE_OPEN;
  }

  /**
   * Opens the socket. Note that a connector which refuses the token answers 401 to the
   * upgrade, but the WebSocket API gives the client no status code — the rejection arrives
   * here as a bare error or an early close, so it surfaces as WEBSOCKET_ERROR and never as
   * UNAUTHORIZED. The session's authenticated capabilities call runs before this and is what
   * actually catches a token the connector no longer accepts.
   */
  connect(): Promise<void> {
    if (this.socket !== null) {
      return Promise.reject(
        new AvionixError({ code: 'INTERNAL', message: 'WebSocketTransport.connect called twice' }),
      );
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let socket: WebSocketLike;
      try {
        socket = this.createSocket(this.options.url);
      } catch (error) {
        reject(
          new AvionixError({
            code: 'WEBSOCKET_ERROR',
            message: `Could not open WebSocket to ${this.safeUrl}`,
            retryable: true,
            cause: error,
          }),
        );
        return;
      }
      this.socket = socket;
      this.closeRequested = false;
      this.closeEmitted = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.logger.warn('connect timeout', { url: this.safeUrl });
        this.detach(socket);
        socket.close();
        this.socket = null;
        reject(
          new AvionixError({
            code: 'TIMEOUT',
            message: `WebSocket to ${this.safeUrl} did not open within ${this.connectTimeoutMs} ms`,
            retryable: true,
          }),
        );
      }, this.connectTimeoutMs);

      socket.onopen = () => {
        if (this.socket !== socket || settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.logger.info('connected', { url: this.safeUrl });
        resolve();
      };
      socket.onerror = (event) => {
        if (this.socket !== socket) {
          return;
        }
        this.logger.warn('socket error', { url: this.safeUrl, event: String(event) });
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.detach(socket);
          this.socket = null;
          reject(
            new AvionixError({
              code: 'WEBSOCKET_ERROR',
              message: `WebSocket to ${this.safeUrl} failed`,
              retryable: true,
              cause: event,
            }),
          );
        }
      };
      socket.onclose = (event) => {
        clearTimeout(timer);
        const info: SocketCloseInfo = {
          code: event.code ?? 1006,
          reason: event.reason ?? '',
          wasClean: event.wasClean ?? false,
          initiatedByClient: this.closeRequested,
        };
        this.handleClosed(socket, info);
        if (!settled) {
          settled = true;
          reject(
            new AvionixError({
              code: 'WEBSOCKET_ERROR',
              message: `WebSocket to ${this.safeUrl} closed before opening (code ${info.code})`,
              retryable: true,
            }),
          );
        }
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) {
          return;
        }
        this.handleMessage(event.data);
      };
    });
  }

  send(
    type: OutgoingMessageType,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<void> {
    if (!this.isOpen || this.socket === null) {
      return Promise.reject(
        new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'WebSocket is not connected' }),
      );
    }
    const reqId = this.requests.nextRequestId();
    const message: OutgoingMessage = { req_id: reqId, type, params };
    const pending = this.requests.register(reqId, timeoutMs);
    try {
      this.socket.send(JSON.stringify(message));
      this.logger.debug('sent', { reqId, type });
    } catch (error) {
      this.requests.reject(
        reqId,
        new AvionixError({
          code: 'WEBSOCKET_ERROR',
          message: 'Failed to send WebSocket message',
          cause: error,
        }),
      );
    }
    return pending;
  }

  close(): void {
    const socket = this.socket;
    if (socket === null) {
      return;
    }
    this.closeRequested = true;
    this.logger.info('closing', { url: this.safeUrl });
    socket.close(1000, 'client disconnect');
  }

  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe {
    this.dataRefListeners.add(listener);
    return () => this.dataRefListeners.delete(listener);
  }

  onCommandUpdate(listener: (updates: Record<string, boolean>) => void): Unsubscribe {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  onClose(listener: (info: SocketCloseInfo) => void): Unsubscribe {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  private detach(socket: WebSocketLike): void {
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
  }

  private handleClosed(socket: WebSocketLike, info: SocketCloseInfo): void {
    if (this.closeEmitted) {
      return;
    }
    this.closeEmitted = true;
    this.socket = null;
    this.logger.info('closed', { code: info.code, initiatedByClient: info.initiatedByClient });
    this.requests.rejectAll(
      new AvionixError({
        code: 'CANCELLED',
        message: `WebSocket closed (code ${info.code}) while a request was pending`,
        retryable: true,
      }),
    );
    for (const listener of this.closeListeners) {
      listener(info);
    }
    this.detach(socket);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.logger.warn('ignoring non-text WebSocket frame');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      this.logger.warn('ignoring malformed WebSocket JSON', { sample: data.slice(0, 80) });
      return;
    }
    const envelope = incomingEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      this.logger.warn('ignoring WebSocket message without type');
      return;
    }
    switch (envelope.data.type) {
      case 'result': {
        const result = resultMessageSchema.safeParse(json);
        if (!result.success) {
          this.logger.warn('ignoring malformed result message');
          return;
        }
        this.requests.settle(result.data);
        return;
      }
      case 'dataref_update_values': {
        const update = dataRefUpdateMessageSchema.safeParse(json);
        if (!update.success) {
          this.logger.warn('ignoring malformed dataref_update_values message');
          return;
        }
        const updates = toDataRefUpdates(update.data.data, this.now());
        for (const listener of this.dataRefListeners) {
          listener(updates);
        }
        return;
      }
      case 'command_update_is_active': {
        const update = commandUpdateMessageSchema.safeParse(json);
        if (!update.success) {
          this.logger.warn('ignoring malformed command_update_is_active message');
          return;
        }
        for (const listener of this.commandListeners) {
          listener(update.data.data);
        }
        return;
      }
      default:
        this.logger.warn('ignoring unknown WebSocket message type', { type: envelope.data.type });
    }
  }
}
