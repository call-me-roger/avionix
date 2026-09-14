import { z } from 'zod';

import { isAvionixError } from '@/domain/errors/avionix-error';
import {
  type FetchInit,
  type FetchLike,
  HttpTransport,
} from '@/infrastructure/xplane/http/http-transport';
import { silentLogger } from '@/infrastructure/logging/logger';

interface Call {
  url: string;
  init: FetchInit;
}

function fakeFetch(
  responder: (
    call: Call,
  ) => Promise<{ status: number; body: string }> | { status: number; body: string },
): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = await responder(call);
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  };
  return { fetchImpl, calls };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected rejection');
  } catch (error) {
    expect(isAvionixError(error) ? error.code : `not avionix: ${String(error)}`).toBe(code);
  }
}

const schema = z.object({ data: z.number() });

function transport(fetchImpl: FetchLike, defaultTimeoutMs = 5000): HttpTransport {
  return new HttpTransport({
    origin: 'http://192.168.1.100:8086',
    fetchImpl,
    defaultTimeoutMs,
    logger: silentLogger,
  });
}

describe('HttpTransport', () => {
  it('sends JSON headers, builds the URL with query and validates the response', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: '{"data": 42}' }));
    const result = await transport(fetchImpl).request({
      method: 'GET',
      path: '/api/v3/datarefs',
      query: { 'filter[name]': 'sim/x' },
      schema,
    });
    expect(result).toEqual({ data: 42 });
    expect(calls[0]?.url).toBe('http://192.168.1.100:8086/api/v3/datarefs?filter[name]=sim%2Fx');
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('serializes the body for PATCH and accepts an empty 200 response without a schema', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: '' }));
    await expect(
      transport(fetchImpl).request({
        method: 'PATCH',
        path: '/api/v3/datarefs/1/value',
        body: { data: 3 },
      }),
    ).resolves.toBeUndefined();
    expect(calls[0]?.init.body).toBe('{"data":3}');
  });

  it('rejects with INVALID_RESPONSE when a schema is given and the body is empty', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, body: '' }));
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'INVALID_RESPONSE',
    );
  });

  it('rejects with INVALID_RESPONSE on malformed JSON', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, body: '{not json' }));
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'INVALID_RESPONSE',
    );
  });

  it('rejects with INVALID_RESPONSE when the schema does not match', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, body: '{"data":"str"}' }));
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'INVALID_RESPONSE',
    );
  });

  it('maps an X-Plane error payload to a simulator error with the X-Plane code', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 404,
      body: '{"error_code":"invalid_dataref_name","error_message":"Dataref x doesn\'t exist"}',
    }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/x', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('DATAREF_NOT_FOUND');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('invalid_dataref_name');
    }
  });

  it('maps a plain 403 to INCOMING_TRAFFIC_DISABLED', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 403, body: '' }));
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'INCOMING_TRAFFIC_DISABLED',
    );
  });

  it('maps other non-2xx without payload to HTTP_ERROR, retryable for 5xx', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 503, body: 'Service Unavailable' }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/x', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('HTTP_ERROR');
      expect(isAvionixError(error) && error.retryable).toBe(true);
      expect(isAvionixError(error) && error.message).toContain('503');
    }
  });

  it('maps a 404 without payload to HTTP_ERROR (not retryable)', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 404, body: 'Not Found' }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/x', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('HTTP_ERROR');
      expect(isAvionixError(error) && error.retryable).toBe(false);
    }
  });

  it('maps fetch rejection to NETWORK_ERROR', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'NETWORK_ERROR',
    );
  });

  it('aborts after the timeout and rejects with TIMEOUT', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const pending = transport(fetchImpl, 1000).request({ method: 'GET', path: '/x', schema });
      const assertion = expectCode(pending, 'TIMEOUT');
      await jest.advanceTimersByTimeAsync(1001);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('honours a per-request timeout override', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const pending = transport(fetchImpl, 5000).request({
        method: 'GET',
        path: '/x',
        schema,
        timeoutMs: 100,
      });
      const assertion = expectCode(pending, 'TIMEOUT');
      await jest.advanceTimersByTimeAsync(101);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
