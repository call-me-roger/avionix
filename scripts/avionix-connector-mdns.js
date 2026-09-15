'use strict';

const SERVICE_TYPE = 'avionix';

function defaultBonjourFactory(onError) {
  // Loaded lazily so the bridge still starts (with --no-mdns) if the package is missing.
  const { Bonjour } = require('bonjour-service');
  return new Bonjour(undefined, onError);
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
        stop() {
          return new Promise((resolve) => {
            if (errorInstance) {
              errorInstance.destroy(() => {
                resolve();
              });
            } else {
              resolve();
            }
          });
        },
      };
    }

    let stopPromise;
    return {
      stop() {
        if (stopPromise) {
          return stopPromise;
        }

        stopPromise = new Promise((resolve) => {
          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              log('mDNS stop timed out');
              resolve();
            }
          }, 2000);

          service.stop(() => {
            instance.destroy(() => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve();
              }
            });
          });
        });

        return stopPromise;
      },
    };
  };
}

function createNullAdvertiser() {
  return function advertise() {
    return { stop: () => Promise.resolve() };
  };
}

module.exports = { SERVICE_TYPE, createBonjourAdvertiser, createNullAdvertiser };
