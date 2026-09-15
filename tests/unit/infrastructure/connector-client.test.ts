import { isAvionixError } from '@/domain/errors/avionix-error';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { createMemorySink, createLogger, silentLogger } from '@/infrastructure/logging/logger';
import { type FetchLike, HttpTransport } from '@/infrastructure/xplane/http/http-transport';

const INFO_BODY = JSON.stringify({
  name: 'Sim PC',
  version: '0.1.0',
  pairingRequired: true,
  xplane: { host: '127.0.0.1', port: 8086, reachable: true },
});

function clientFor(
  responder: (url: string, body: string | undefined) => { status: number; body: string },
  logger = silentLogger,
): { client: ConnectorClient; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    urls.push(url);
    const { status, body } = responder(url, init.body);
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  };
  const http = new HttpTransport({
    origin: 'http://pc.local:8080',
    fetchImpl,
    logger: silentLogger,
  });
  return { client: new ConnectorClient({ http, logger }), urls };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : `not avionix: ${String(error)}`;
  }
}

describe('ConnectorClient.getInfo', () => {
  it('parses a connector info payload', async () => {
    const { client, urls } = clientFor(() => ({ status: 200, body: INFO_BODY }));
    await expect(client.getInfo()).resolves.toEqual({
      name: 'Sim PC',
      version: '0.1.0',
      pairingRequired: true,
      xplane: { host: '127.0.0.1', port: 8086, reachable: true },
    });
    expect(urls).toEqual(['http://pc.local:8080/avionix/info']);
  });

  it('returns null when the target answers 404 (plain X-Plane)', async () => {
    const { client } = clientFor(() => ({ status: 404, body: 'Not Found' }));
    await expect(client.getInfo()).resolves.toBeNull();
  });

  it('returns null for an HTML body', async () => {
    const { client } = clientFor(() => ({ status: 200, body: '<!doctype html><title>x</title>' }));
    await expect(client.getInfo()).resolves.toBeNull();
  });

  it('returns null for JSON of the wrong shape', async () => {
    const { client } = clientFor(() => ({ status: 200, body: '{"api":{"versions":["v3"]}}' }));
    await expect(client.getInfo()).resolves.toBeNull();
  });

  it('propagates a network error so an unreachable host still fails the connect', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    const http = new HttpTransport({
      origin: 'http://pc.local:8080',
      fetchImpl,
      logger: silentLogger,
    });
    await expect(codeOf(new ConnectorClient({ http }).getInfo())).resolves.toBe('NETWORK_ERROR');
  });

  it('propagates a 403 as INCOMING_TRAFFIC_DISABLED', async () => {
    const { client } = clientFor(() => ({ status: 403, body: '' }));
    await expect(codeOf(client.getInfo())).resolves.toBe('INCOMING_TRAFFIC_DISABLED');
  });
});

describe('ConnectorClient.pair', () => {
  it('posts the code and returns the token', async () => {
    const bodies: (string | undefined)[] = [];
    const { client, urls } = clientFor((_url, body) => {
      bodies.push(body);
      return { status: 200, body: '{"token":"tok-abc"}' };
    });
    await expect(client.pair('123456')).resolves.toBe('tok-abc');
    expect(urls).toEqual(['http://pc.local:8080/avionix/pair']);
    expect(bodies).toEqual(['{"code":"123456"}']);
  });

  it('rejects an empty token with INVALID_RESPONSE', async () => {
    const { client } = clientFor(() => ({ status: 200, body: '{"token":""}' }));
    await expect(codeOf(client.pair('123456'))).resolves.toBe('INVALID_RESPONSE');
  });

  it.each([
    [401, 'pairing_invalid_code', 'PAIRING_FAILED'],
    [429, 'pairing_rate_limited', 'PAIRING_RATE_LIMITED'],
    [429, 'too_many_attempts', 'PAIRING_RATE_LIMITED'],
    [400, 'invalid_body', 'SIMULATOR_ERROR'],
  ])('maps %s %s to %s', async (status, errorCode, expected) => {
    const { client } = clientFor(() => ({
      status,
      body: JSON.stringify({ error_code: errorCode, error_message: 'nope' }),
    }));
    await expect(codeOf(client.pair('000000'))).resolves.toBe(expected);
  });

  it('never logs the token', async () => {
    const sink = createMemorySink();
    const { client } = clientFor(
      () => ({ status: 200, body: '{"token":"super-secret"}' }),
      createLogger('connection', { sink, minLevel: 'debug' }),
    );
    await client.pair('123456');
    expect(JSON.stringify(sink.entries)).not.toContain('super-secret');
  });
});
