import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';

const CODE_MAP: Readonly<Record<string, AvionixErrorCode>> = {
  invalid_dataref_name: 'DATAREF_NOT_FOUND',
  invalid_dataref_id: 'DATAREF_NOT_FOUND',
  invalid_command_name: 'COMMAND_NOT_FOUND',
  invalid_command_id: 'COMMAND_NOT_FOUND',
  dataref_is_readonly: 'DATAREF_READONLY',
  // Avionix Connector codes (docs/connector.md).
  unauthorized: 'UNAUTHORIZED',
  pairing_invalid_code: 'PAIRING_FAILED',
  pairing_rate_limited: 'PAIRING_RATE_LIMITED',
  too_many_attempts: 'PAIRING_RATE_LIMITED',
};

/** Codes the caller may retry unchanged after waiting; everything else is terminal. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set(['pairing_rate_limited', 'too_many_attempts']);

export function simulatorErrorToAvionixError(input: {
  errorCode: string;
  errorMessage?: string;
  httpStatus?: number;
  cause?: unknown;
}): AvionixError {
  return new AvionixError({
    code: CODE_MAP[input.errorCode] ?? 'SIMULATOR_ERROR',
    message: input.errorMessage ?? `X-Plane error: ${input.errorCode}`,
    retryable: RETRYABLE_CODES.has(input.errorCode),
    simulatorErrorCode: input.errorCode,
    httpStatus: input.httpStatus,
    cause:
      input.cause ??
      (input.httpStatus === undefined ? undefined : { httpStatus: input.httpStatus }),
  });
}
