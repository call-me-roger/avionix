import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';

const CODE_MAP: Readonly<Record<string, AvionixErrorCode>> = {
  invalid_dataref_name: 'DATAREF_NOT_FOUND',
  invalid_dataref_id: 'DATAREF_NOT_FOUND',
  invalid_command_name: 'COMMAND_NOT_FOUND',
  invalid_command_id: 'COMMAND_NOT_FOUND',
  dataref_is_readonly: 'DATAREF_READONLY',
};

export function simulatorErrorToAvionixError(input: {
  errorCode: string;
  errorMessage?: string;
  httpStatus?: number;
  cause?: unknown;
}): AvionixError {
  return new AvionixError({
    code: CODE_MAP[input.errorCode] ?? 'SIMULATOR_ERROR',
    message: input.errorMessage ?? `X-Plane error: ${input.errorCode}`,
    retryable: false,
    simulatorErrorCode: input.errorCode,
    cause:
      input.cause ??
      (input.httpStatus === undefined ? undefined : { httpStatus: input.httpStatus }),
  });
}
