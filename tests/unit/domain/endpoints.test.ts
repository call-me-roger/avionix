import {
  capabilitiesPath,
  httpOrigin,
  restPath,
  webSocketUrl,
  wsOrigin,
} from '@/domain/connection/endpoints';

const config = { host: '192.168.1.100', port: 8086 };

describe('endpoints', () => {
  it('derives origins', () => {
    expect(httpOrigin(config)).toBe('http://192.168.1.100:8086');
    expect(wsOrigin(config)).toBe('ws://192.168.1.100:8086');
  });

  it('keeps the capabilities path unversioned', () => {
    expect(capabilitiesPath()).toBe('/api/capabilities');
  });

  it('prefixes REST paths with the negotiated version', () => {
    expect(restPath('v3', '/datarefs')).toBe('/api/v3/datarefs');
    expect(restPath('v2', '/command/12/activate')).toBe('/api/v2/command/12/activate');
    expect(restPath('v2', 'datarefs/count')).toBe('/api/v2/datarefs/count');
  });

  it('derives the versioned WebSocket URL', () => {
    expect(webSocketUrl(config, 'v3')).toBe('ws://192.168.1.100:8086/api/v3');
  });
});
