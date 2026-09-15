'use strict';

const SERVICE_TYPE = 'avionix';

function defaultBonjourFactory(onError) {
  // Loaded lazily, and any failure here is caught by advertise()'s try/catch below, so a
  // missing or broken bonjour-service package can never stop the bridge from starting
  // (with or without --no-mdns).
  const { Bonjour } = require('bonjour-service');
  return new Bonjour(undefined, onError);
}

function boundedShutdown(instance, service, log, timeoutMs = 2000) {
  let stopPromise;

  return function stop() {
    if (stopPromise) {
      return stopPromise;
    }

    if (!instance) {
      return Promise.resolve();
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
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              log(`mDNS destroy error: ${message}`);
            }
          }
          log('mDNS stop timed out; destroyed instance');
          resolve();
        }
      }, timeoutMs);

      const attemptDestroy = () => {
        if (!destroyed) {
          destroyed = true;
          try {
            instance.destroy(() => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve();
              }
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`mDNS destroy error: ${message}`);
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve();
            }
          }
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
    const onError = (error) => {
      const message = error instanceof Error ? error.message : String(error);
      log(`mDNS error: ${message}`);
    };

    // Separate factory failure from publish failure
    try {
      instance = factory(onError);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`mDNS unavailable: ${message}`);
      return {
        stop: () => Promise.resolve(),
      };
    }

    let service;
    try {
      service = instance.publish({
        name: spec.name,
        type: SERVICE_TYPE,
        port: spec.port,
        txt: spec.txt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`mDNS error: ${message}`);
      return {
        stop: boundedShutdown(instance, null, log),
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
