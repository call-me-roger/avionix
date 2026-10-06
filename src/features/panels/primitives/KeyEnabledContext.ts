import { createContext, useContext } from 'react';

/**
 * Whether the `ControlButton` a component is nested in is currently enabled. `DisplayWindow`
 * reads this to dim its text exactly as `stale` does, so a value made pressable through
 * `ControlButton`'s `children` (a radio standby window, a transponder code, a selector value)
 * never stays full-brightness while its key cannot be pressed. Default `true`: a `DisplayWindow`
 * outside any `ControlButton` is never dimmed by this.
 */
export const KeyEnabledContext = createContext(true);

export function useKeyEnabled(): boolean {
  return useContext(KeyEnabledContext);
}
