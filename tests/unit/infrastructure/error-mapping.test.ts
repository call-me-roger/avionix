import { simulatorErrorToAvionixError } from '@/infrastructure/xplane/http/error-mapping';

describe('simulatorErrorToAvionixError', () => {
  it.each([
    ['invalid_dataref_name', 'DATAREF_NOT_FOUND'],
    ['invalid_dataref_id', 'DATAREF_NOT_FOUND'],
    ['invalid_command_name', 'COMMAND_NOT_FOUND'],
    ['invalid_command_id', 'COMMAND_NOT_FOUND'],
    ['dataref_is_readonly', 'DATAREF_READONLY'],
    ['index_out_of_range', 'SIMULATOR_ERROR'],
    ['unknown_type', 'SIMULATOR_ERROR'],
    ['something_new', 'SIMULATOR_ERROR'],
  ])('maps %s to %s', (errorCode, expected) => {
    const error = simulatorErrorToAvionixError({ errorCode, errorMessage: 'msg' });
    expect(error.code).toBe(expected);
    expect(error.simulatorErrorCode).toBe(errorCode);
    expect(error.message).toBe('msg');
    expect(error.retryable).toBe(false);
  });

  it('falls back to the error code as message when the message is missing', () => {
    expect(simulatorErrorToAvionixError({ errorCode: 'invalid_body' }).message).toBe(
      'X-Plane error: invalid_body',
    );
  });

  it.each([
    ['unauthorized', 'UNAUTHORIZED', false],
    ['pairing_invalid_code', 'PAIRING_FAILED', false],
    ['pairing_rate_limited', 'PAIRING_RATE_LIMITED', true],
    ['too_many_attempts', 'PAIRING_RATE_LIMITED', true],
  ])('maps the connector code %s to %s', (errorCode, expected, retryable) => {
    const error = simulatorErrorToAvionixError({ errorCode, errorMessage: 'msg', httpStatus: 429 });
    expect(error.code).toBe(expected);
    expect(error.retryable).toBe(retryable);
    expect(error.simulatorErrorCode).toBe(errorCode);
    expect(error.httpStatus).toBe(429);
  });
});
