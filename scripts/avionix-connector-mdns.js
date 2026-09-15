'use strict';

const SERVICE_TYPE = 'avionix';

function defaultBonjourFactory(onError) {
  // Loaded lazily so the bridge still starts (with --no-mdns) if the package is missing.
  const { Bonjour } = require('bonjour-service');
  return new Bonjour(undefined, onError);
}

function boundedShutdown(instance, service, log, timeoutMs = 2000) {
  let stopPromise;

  return function stop() {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = new Promise((resolve) => {
      let resolved = false;
      let destroyed = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (!destroyed) {
            destroyed = true;
            try {
              instance.destroy(() => undefined);
            } catch {
              // Ignore errors during forced destroy
            }
          }
          log('mDNS stop timed out; destroyed instance');
          resolve();
        }
      }, timeoutMs);

      const attemptDestroy = () => {
        if (!destroyed) {
          destroyed = true;
          instance.destroy(() => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve();
            }
          });
        }
      };

      if (service) {
        service.stop(() => {
          attemptDestroy();
        });
      } else {
        attemptDestroy();
      }
    });

    return stopPromise;
  };
}

function createBonjourAdvertiser(factory = defaultBonjourFactory, log = () => undefined) {
  return function advertise(spec) {
    let instance;
    let service;
    const onError = (error) => {
      const message = error instanceof Error ? error.message : String(error);
      log(`mDNS error: ${message}`);
    };

    try {
      instance = factory(onError);
      service = instance.publish({
        name: spec.name,
        type: SERVICE_TYPE,
        port: spec.port,
        txt: spec.txt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`mDNS error: ${message}`);
      const errorInstance = instance;
      return {
        stop: boundedShutdown(errorInstance, null, log),
      };
    }

    return {
      stop: boundedShutdown(instance, service, log),
    };
  };
}

function createNullAdvertiser() {
  return function advertise() {
    return { stop: () => Promise.resolve() };
  };
}

module.exports = { SERVICE_TYPE, createBonjourAdvertiser, createNullAdvertiser };
