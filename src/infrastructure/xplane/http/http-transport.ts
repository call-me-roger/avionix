import type { ZodType } from 'zod';

import { AvionixError } from '@/domain/errors/avionix-error';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { type AuthProvider, noAuth } from '@/infrastructure/xplane/auth';
import { simulatorErrorToAvionixError } from '@/infrastructure/xplane/http/error-mapping';
import { type QueryParams, buildQueryString } from '@/infrastructure/xplane/http/query-string';
import { parseWith } from '@/infrastructure/xplane/schemas/mappers';
import { errorPayloadSchema } from '@/infrastructure/xplane/schemas/rest';

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>;

export interface HttpRequest<T> {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  query?: QueryParams;
  body?: unknown;
  schema?: ZodType<T>;
  timeoutMs?: number;
}

export interface HttpTransportOptions {
  origin: string;
  fetchImpl?: FetchLike;
  defaultTimeoutMs?: number;
  logger?: Logger;
  /** Supplies the connector bearer token, or null for a direct X-Plane connection. */
  auth?: AuthProvider;
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export class HttpTransport {
  private readonly origin: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultTimeoutMs: number;
  private readonly logger: Logger;
  private readonly auth: AuthProvider;

  constructor(options: HttpTransportOptions) {
    this.origin = options.origin;
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.logger = options.logger ?? silentLogger;
    this.auth = options.auth ?? noAuth;
  }

  request(req: HttpRequest<void> & { schema?: undefined }): Promise<void>;
  request<T>(req: HttpRequest<T> & { schema: ZodType<T> }): Promise<T>;
  async request<T>(req: HttpRequest<T>): Promise<T | void> {
    const url = `${this.origin}${req.path}${buildQueryString(req.query ?? {})}`;
    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const token = this.auth();
    if (token !== null) {
      // Never logged: the debug lines below carry method, url and status only.
      headers.Authorization = `Bearer ${token}`;
    }
    const init: FetchInit = {
      method: req.method,
      headers,
      signal: controller.signal,
    };
    if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }
    this.logger.debug('request', { method: req.method, url });

    let response: FetchResponseLike;
    let text: string;
    try {
      response = await this.fetchImpl(url, init);
      text = await response.text();
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new AvionixError({
          code: 'TIMEOUT',
          message: `X-Plane did not answer ${req.method} ${req.path} within ${timeoutMs} ms`,
          retryable: true,
          cause: error,
        });
      }
      throw new AvionixError({
        code: 'NETWORK_ERROR',
        message: `Could not reach X-Plane at ${this.origin}`,
        retryable: true,
        cause: error,
      });
    }
    clearTimeout(timer);
    this.logger.debug('response', { status: response.status, url });

    if (!response.ok) {
      throw this.toHttpError(response.status, text, req);
    }
    if (req.schema === undefined) {
      return undefined;
    }
    if (text.trim().length === 0) {
      throw new AvionixError({
        code: 'INVALID_RESPONSE',
        message: `X-Plane returned an empty body for ${req.method} ${req.path}`,
      });
    }
    const parsed = parseJsonText(text);
    if (!parsed.ok) {
      throw new AvionixError({
        code: 'INVALID_RESPONSE',
        message: `X-Plane returned malformed JSON for ${req.method} ${req.path}`,
      });
    }
    return parseWith(req.schema, parsed.value, `${req.method} ${req.path}`);
  }

  private toHttpError(status: number, text: string, req: HttpRequest<unknown>): AvionixError {
    const parsed = parseJsonText(text);
    if (parsed.ok) {
      const payload = errorPayloadSchema.safeParse(parsed.value);
      if (payload.success) {
        return simulatorErrorToAvionixError({
          errorCode: payload.data.error_code,
          errorMessage: payload.data.error_message,
          httpStatus: status,
        });
      }
    }
    if (status === 401) {
      // An Avionix Connector that does not recognise our token; X-Plane itself never
      // answers 401, so a bare 401 means the same thing as error_code "unauthorized".
      return new AvionixError({
        code: 'UNAUTHORIZED',
        message:
          'The Avionix Connector rejected this device (HTTP 401). Pair again with the code ' +
          'shown in the connector window.',
        httpStatus: status,
      });
    }
    if (status === 403) {
      return new AvionixError({
        code: 'INCOMING_TRAFFIC_DISABLED',
        message:
          'X-Plane refused the request (HTTP 403). In X-Plane, open Settings > Network and ' +
          'make sure "Disable Incoming Traffic" is not selected.',
        httpStatus: status,
      });
    }
    return new AvionixError({
      code: 'HTTP_ERROR',
      message: `X-Plane answered HTTP ${status} for ${req.method} ${req.path}`,
      retryable: status >= 500,
      httpStatus: status,
    });
  }
}
