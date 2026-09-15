import { AvionixError, isAvionixError, toAvionixError } from '@/domain/errors/avionix-error';

describe('AvionixError', () => {
  it('carries code, retryable flag, simulator code and cause', () => {
    const cause = new Error('boom');
    const error = new AvionixError({
      code: 'SIMULATOR_ERROR',
      message: 'Dataref does not exist',
      retryable: false,
      simulatorErrorCode: 'invalid_dataref_id',
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AvionixError');
    expect(error.code).toBe('SIMULATOR_ERROR');
    expect(error.retryable).toBe(false);
    expect(error.simulatorErrorCode).toBe('invalid_dataref_id');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Dataref does not exist');
  });

  it('defaults retryable to false', () => {
    expect(new AvionixError({ code: 'UNKNOWN', message: 'x' }).retryable).toBe(false);
  });

  it('isAvionixError narrows correctly', () => {
    expect(isAvionixError(new AvionixError({ code: 'TIMEOUT', message: 't' }))).toBe(true);
    expect(isAvionixError(new Error('plain'))).toBe(false);
    expect(isAvionixError('string')).toBe(false);
    expect(isAvionixError(null)).toBe(false);
  });

  it('toAvionixError returns the same instance for AvionixError input', () => {
    const original = new AvionixError({ code: 'TIMEOUT', message: 't' });
    expect(toAvionixError(original, { code: 'UNKNOWN', message: 'fallback' })).toBe(original);
  });

  it('toAvionixError wraps Error and non-Error values with the fallback code', () => {
    const wrapped = toAvionixError(new Error('inner'), { code: 'NETWORK_ERROR', message: 'net' });
    expect(wrapped.code).toBe('NETWORK_ERROR');
    expect(wrapped.message).toBe('net: inner');
    expect(wrapped.cause).toBeInstanceOf(Error);

    const wrappedString = toAvionixError('oops', { code: 'UNKNOWN', message: 'fallback' });
    expect(wrappedString.code).toBe('UNKNOWN');
    expect(wrappedString.message).toBe('fallback: oops');
  });

  it('carries an http status when one is given and undefined otherwise', () => {
    const withStatus = new AvionixError({ code: 'HTTP_ERROR', message: 'x', httpStatus: 404 });
    expect(withStatus.httpStatus).toBe(404);
    expect(new AvionixError({ code: 'UNKNOWN', message: 'x' }).httpStatus).toBeUndefined();
  });

  it('accepts the pairing error codes', () => {
    const codes = [
      'PAIRING_REQUIRED',
      'PAIRING_FAILED',
      'PAIRING_RATE_LIMITED',
      'UNAUTHORIZED',
    ] as const;
    for (const code of codes) {
      expect(new AvionixError({ code, message: code }).code).toBe(code);
    }
  });
});
