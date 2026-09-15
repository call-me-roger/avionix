'use strict';

const SERVICE_TYPE = 'avionix';

function defaultBonjourFactory() {
  // Loaded lazily so the bridge still starts (with --no-mdns) if the package is missing.
  const { Bonjour } = require('bonjour-service');
  return new Bonjour();
}

function createBonjourAdvertiser(factory = defaultBonjourFactory) {
  return function advertise(spec) {
    const instance = factory();
    const service = instance.publish({
      name: spec.name,
      type: SERVICE_TYPE,
      port: spec.port,
      txt: spec.txt,
    });
    return {
      stop() {
        return new Promise((resolve) => {
          service.stop(() => {
            instance.destroy();
            resolve();
          });
        });
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
