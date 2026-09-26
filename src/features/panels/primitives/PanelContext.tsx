import { createContext, useContext } from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { PanelLinkStatus } from '@/domain/panels/panel-link';
import type { DataRefValue } from '@/domain/simulator/types';

export interface PanelActions {
  write: (featureId: string, name: string, value: DataRefValue) => Promise<void>;
  activate: (featureId: string, name: string, durationSec?: number) => Promise<void>;
}

/** What every primitive inside a panel reads, computed once per render by PanelFrame. */
export interface PanelContextValue extends PanelActions {
  snapshot: SessionSnapshot;
  link: PanelLinkStatus;
  now: number;
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext);
  if (value === null) {
    throw new Error('usePanel must be used inside PanelFrame');
  }
  return value;
}
