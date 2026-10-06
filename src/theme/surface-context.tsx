import { createContext, useContext } from 'react';

/**
 * Whether the current subtree is drawn on an avionics bezel (`AvionicsUnit`). `BodyText` reads
 * this to switch to the avionics palette, so every notice, reason and read-back sentence stays
 * readable inside a dark unit without per-call-site styling. Default `false`: app chrome.
 */
export const OnBezelContext = createContext(false);

export function useOnBezel(): boolean {
  return useContext(OnBezelContext);
}
