import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { createLogger } from '@/infrastructure/logging/logger';

export const KEEP_AWAKE_TAG = 'avionix-panel';

const logger = createLogger('ui');

/**
 * F-04 R5. On the web this is the Screen Wake Lock API, which a browser may refuse (no support,
 * page hidden, no user gesture yet); a refusal is a debug line, never an error on screen.
 */
export async function holdScreenAwake(): Promise<void> {
  try {
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  } catch (error) {
    logger.debug('keep-awake unavailable', { message: String(error) });
  }
}

export async function releaseScreenAwake(): Promise<void> {
  try {
    await deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch (error) {
    logger.debug('keep-awake release failed', { message: String(error) });
  }
}
