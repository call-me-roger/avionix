import {
  SERVICE_TYPE,
  createBonjourAdvertiser,
  createNullAdvertiser,
} from '../../../scripts/avionix-connector-mdns';

describe('connector mDNS advertiser', () => {
  it('publishes an _avionix._tcp service with the given name, port and txt, and stops it', async () => {
    const published: unknown[] = [];
    let stopped = 0;
    let destroyed = 0;
    const fakeBonjour = {
      publish(options: unknown) {
        published.push(options);
        return {
          stop: (cb: () => void) => {
            stopped += 1;
            cb();
          },
        };
      },
      destroy() {
        destroyed += 1;
      },
    };
    const advertise = createBonjourAdvertiser(() => fakeBonjour);
    const ad = advertise({
      name: 'Avionix Connector (pc)',
      port: 8080,
      txt: { v: '1', pairing: '1' },
    });
    expect(published).toEqual([
      {
        name: 'Avionix Connector (pc)',
        type: SERVICE_TYPE,
        port: 8080,
        txt: { v: '1', pairing: '1' },
      },
    ]);
    await ad.stop();
    expect(stopped).toBe(1);
    expect(destroyed).toBe(1);
  });

  it('the null advertiser does nothing', async () => {
    const ad = createNullAdvertiser()({ name: 'x', port: 1, txt: {} });
    await expect(ad.stop()).resolves.toBeUndefined();
  });

  it('SERVICE_TYPE is avionix', () => {
    expect(SERVICE_TYPE).toBe('avionix');
  });
});
