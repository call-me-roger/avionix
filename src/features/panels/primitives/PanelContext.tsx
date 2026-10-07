import { createContext, useContext } from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { ActivationResult } from '@/domain/panels/activation';
import type { HoldPhase } from '@/domain/panels/hold-lease';
import type { PanelLinkStatus } from '@/domain/panels/panel-link';
import type { DataRefValue } from '@/domain/simulator/types';

export interface PanelActions {
  write: (featureId: string, name: string, value: DataRefValue) => Promise<void>;
  activate: (featureId: string, name: string, durationSec?: number) => Promise<ActivationResult>;
  /** Presses, renews or releases a held command (F-24 §4.3); see `SimulatorSession.holdCommand`. */
  hold: (featureId: string, name: string, phase: HoldPhase) => Promise<ActivationResult>;
}

/**
 * What a PanelScope or PanelFrame is given. `hold` may be left out (the flight data strip, and
 * panels that never hold a command); every hold is then refused.
 */
export type PanelScopeActions = Omit<PanelActions, 'hold'> & Partial<Pick<PanelActions, 'hold'>>;

export const REFUSE_HOLD: PanelActions['hold'] = async () => 'refused';

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
