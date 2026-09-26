import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { createLogger } from '@/infrastructure/logging/logger';

export const KEEP_AWAKE_TAG = 'avionix-panel';

const logger = createLogger('ui');

/**
 * Every hold and release runs after the one before it has settled. On the web a hold is a Screen
 * Wake Lock request that resolves later; a release issued before it resolved would find no lock
 * to release (and throw), and the lock granted afterwards would then stay held. Never rejects.
 */
let queue: Promise<void> = Promise.resolve();

function enqueue(step: () => Promise<void>): Promise<void> {
  queue = queue.then(step);
  return queue;
}

/**
 * F-04 R5. On the web this is the Screen Wake Lock API, which a browser may refuse (no support,
 * page hidden, no user gesture yet); a refusal is a debug line, never an error on screen.
 */
export function holdScreenAwake(): Promise<void> {
  return enqueue(async () => {
    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch (error) {
      logger.debug('keep-awake unavailable', { message: String(error) });
    }
  });
}

export function releaseScreenAwake(): Promise<void> {
  return enqueue(async () => {
    try {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch (error) {
      logger.debug('keep-awake release failed', { message: String(error) });
    }
  });
}
