import type { BrowsedService } from '@/domain/discovery/service-browser';
import { discoveredConnectorFrom } from '@/domain/discovery/discovered-connector';

function service(overrides: Partial<BrowsedService> = {}): BrowsedService {
  return {
    name: 'Avionix Connector (sim-pc)',
    host: 'sim-pc.local.',
    port: 8080,
    addresses: ['fe80::1', '192.168.1.20'],
    txt: { v: '1', pairing: '1' },
    ...overrides,
  };
}

describe('discoveredConnectorFrom', () => {
  it('prefers the first IPv4 address and reads the pairing flag', () => {
    expect(discoveredConnectorFrom(service())).toEqual({
      name: 'Avionix Connector (sim-pc)',
      host: '192.168.1.20',
      port: 8080,
      pairingRequired: true,
    });
  });

  it('takes the first IPv4 address when several are advertised', () => {
    expect(
      discoveredConnectorFrom(service({ addresses: ['10.0.0.5', '192.168.1.20'] }))?.host,
    ).toBe('10.0.0.5');
  });

  it('falls back to the hostname without its trailing dot', () => {
    expect(discoveredConnectorFrom(service({ addresses: ['fe80::1'] }))?.host).toBe('sim-pc.local');
    expect(discoveredConnectorFrom(service({ addresses: [], host: 'sim-pc.local' }))?.host).toBe(
      'sim-pc.local',
    );
  });

  it('returns null when neither an IPv4 address nor a hostname is usable', () => {
    expect(discoveredConnectorFrom(service({ addresses: [], host: '' }))).toBeNull();
    expect(discoveredConnectorFrom(service({ addresses: ['fe80::1'], host: '.' }))).toBeNull();
  });

  it('ignores addresses that only look like IPv4', () => {
    expect(discoveredConnectorFrom(service({ addresses: ['999.1.1.1', '1.2.3'] }))?.host).toBe(
      'sim-pc.local',
    );
  });

  it('maps pairing=0 to false and anything else to null', () => {
    expect(discoveredConnectorFrom(service({ txt: { pairing: '0' } }))?.pairingRequired).toBe(
      false,
    );
    expect(discoveredConnectorFrom(service({ txt: {} }))?.pairingRequired).toBeNull();
    expect(
      discoveredConnectorFrom(service({ txt: { pairing: 'yes' } }))?.pairingRequired,
    ).toBeNull();
  });
});
