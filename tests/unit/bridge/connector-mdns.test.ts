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
      destroy(cb?: () => void) {
        destroyed += 1;
        if (cb) cb();
      },
    };
    const advertise = createBonjourAdvertiser((onError) => {
      expect(typeof onError).toBe('function');
      return fakeBonjour;
    });
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

  it('the factory receives an onError callback and invoking it calls the injected log', async () => {
    const logs: string[] = [];
    let capturedOnError: ((error: unknown) => void) | undefined;

    const fakeBonjour = {
      publish() {
        return {
          stop: (cb: () => void) => cb(),
        };
      },
      destroy(cb?: () => void) {
        if (cb) cb();
      },
    };

    const advertise = createBonjourAdvertiser(
      (onError) => {
        capturedOnError = onError;
        return fakeBonjour;
      },
      (line) => logs.push(line),
    );

    const ad = advertise({ name: 'test', port: 1234, txt: {} });
    expect(capturedOnError).toBeDefined();

    // Invoke the error callback
    capturedOnError!(new Error('multicast down'));

    expect(logs).toContainEqual(expect.stringContaining('multicast down'));
    await ad.stop();
  });

  it('a fake whose publish throws logs the error and stop() still resolves', async () => {
    const logs: string[] = [];

    const fakeBonjour = {
      publish() {
        throw new Error('publish failed');
      },
      destroy(cb?: () => void) {
        if (cb) cb();
      },
    };

    const advertise = createBonjourAdvertiser(
      (onError) => fakeBonjour,
      (line) => logs.push(line),
    );

    const ad = advertise({ name: 'test', port: 1234, txt: {} });

    expect(logs).toContainEqual(expect.stringContaining('publish failed'));
    await expect(ad.stop()).resolves.toBeUndefined();
  });

  it('with fake timers, stop() without callback resolves after 2001 ms and logs timeout', async () => {
    jest.useFakeTimers();

    const logs: string[] = [];
    let stopCalled = false;

    const fakeBonjour = {
      publish() {
        return {
          stop: (cb: () => void) => {
            stopCalled = true;
            // Intentionally never call cb to simulate timeout
          },
        };
      },
      destroy(cb?: () => void) {
        // Also never call cb
      },
    };

    const advertise = createBonjourAdvertiser(
      (onError) => fakeBonjour,
      (line) => logs.push(line),
    );

    const ad = advertise({ name: 'test', port: 1234, txt: {} });
    const stopPromise = ad.stop();

    jest.advanceTimersByTime(2001);
    await stopPromise;

    expect(logs).toContainEqual(expect.stringContaining('timed out'));
    expect(stopCalled).toBe(true);

    jest.useRealTimers();
  });

  it('stop() twice returns the same promise and stops once', async () => {
    let stopCallCount = 0;
    let destroyCallCount = 0;

    const fakeBonjour = {
      publish() {
        return {
          stop: (cb: () => void) => {
            stopCallCount += 1;
            cb();
          },
        };
      },
      destroy(cb?: () => void) {
        destroyCallCount += 1;
        if (cb) cb();
      },
    };

    const advertise = createBonjourAdvertiser((onError) => fakeBonjour);
    const ad = advertise({ name: 'test', port: 1234, txt: {} });

    const promise1 = ad.stop();
    const promise2 = ad.stop();

    expect(promise1).toBe(promise2);

    await promise1;

    expect(stopCallCount).toBe(1);
    expect(destroyCallCount).toBe(1);
  });
});
