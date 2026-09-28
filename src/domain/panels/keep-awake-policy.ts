import type { ConnectionState } from '@/domain/connection/connection-state';

export interface KeepAwakeInput {
  foreground: boolean;
  linkState: ConnectionState;
  /** A panel, not Setup, is the route on screen. */
  onPanel: boolean;
}

/**
 * R5. Reconnecting holds, because a tablet sleeping through a Wi-Fi blip on short final is the
 * failure the user story names; disconnected, error and pairing release.
 */
export function shouldHoldScreenAwake(input: KeepAwakeInput): boolean {
  return (
    input.foreground &&
    input.onPanel &&
    (input.linkState === 'connected' || input.linkState === 'reconnecting')
  );
}
