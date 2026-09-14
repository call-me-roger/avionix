export type AvionixErrorCode =
  | 'INVALID_HOST'
  | 'INVALID_PORT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INCOMING_TRAFFIC_DISABLED'
  | 'UNSUPPORTED_API'
  | 'INVALID_RESPONSE'
  | 'WEBSOCKET_ERROR'
  | 'DATAREF_NOT_FOUND'
  | 'COMMAND_NOT_FOUND'
  | 'DATAREF_READONLY'
  | 'SUBSCRIPTION_FAILED'
  | 'WRITE_FAILED'
  | 'COMMAND_FAILED'
  | 'SIMULATOR_ERROR'
  | 'CANCELLED'
  | 'INTERNAL'
  | 'UNKNOWN';

export interface AvionixErrorInit {
  code: AvionixErrorCode;
  message: string;
  retryable?: boolean;
  simulatorErrorCode?: string;
  cause?: unknown;
}

export class AvionixError extends Error {
  readonly code: AvionixErrorCode;
  readonly retryable: boolean;
  readonly simulatorErrorCode: string | undefined;
  override readonly cause: unknown;

  constructor(init: AvionixErrorInit) {
    super(init.message);
    this.name = 'AvionixError';
    this.code = init.code;
    this.retryable = init.retryable ?? false;
    this.simulatorErrorCode = init.simulatorErrorCode;
    this.cause = init.cause;
  }
}

export function isAvionixError(value: unknown): value is AvionixError {
  return value instanceof AvionixError;
}

function describeUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function toAvionixError(
  value: unknown,
  fallback: { code: AvionixErrorCode; message: string; retryable?: boolean },
): AvionixError {
  if (isAvionixError(value)) {
    return value;
  }
  return new AvionixError({
    code: fallback.code,
    message: `${fallback.message}: ${describeUnknown(value)}`,
    retryable: fallback.retryable ?? false,
    cause: value,
  });
}
