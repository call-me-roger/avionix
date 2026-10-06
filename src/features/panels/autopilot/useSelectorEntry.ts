import { useState } from 'react';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import {
  EMPTY_SELECTOR_DRAFT,
  type SelectorDraft,
  deleteSelectorDigit,
  pushSelectorDigit,
  toggleSelectorSign,
} from '@/domain/autopilot/selector-entry';
import type { SelectorKind } from '@/domain/autopilot/selectors';
import {
  SELECTORS,
  type SelectorId,
  type SelectorSpec,
  autopilotNumber,
  selectorKind,
} from '@/features/panels/autopilot/autopilot';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface SelectorEntry {
  target: { spec: SelectorSpec; kind: SelectorKind } | null;
  draft: SelectorDraft;
  open: (id: SelectorId) => void;
  digit: (value: number) => void;
  erase: () => void;
  clear: () => void;
  sign: () => void;
  cancel: () => void;
  /** Set was pressed: close once X-Plane accepts the write, keep the draft if it fails. */
  sent: () => void;
}

interface State {
  id: SelectorId | null;
  kind: SelectorKind | null;
  draft: SelectorDraft;
  sentAt: number | null;
}

const CLOSED: State = { id: null, kind: null, draft: EMPTY_SELECTOR_DRAFT, sentAt: null };

/**
 * The staged selector entry, on F-21's rules: one at a time, dropped — never kept — when controls
 * go inert (R7), and dropped when X-Plane switches the airspeed between knots and Mach, so a
 * knots draft can never be sent as Mach. Resets adjust state while rendering (no effects).
 */
export function useSelectorEntry(): SelectorEntry {
  const { snapshot, link, now } = usePanel();
  const [state, setState] = useState<State>(CLOSED);
  const isMach = autopilotNumber(snapshot, D.airspeedIsMach) === 1;
  const spec = state.id === null ? null : (SELECTORS.find((s) => s.id === state.id) ?? null);
  const kind = spec === null ? null : selectorKind(spec.id, isMach);

  if (spec !== null && (!link.controlsEnabled || kind !== state.kind)) {
    setState(CLOSED);
  } else if (spec !== null && state.sentAt !== null) {
    const outcome = snapshot.operations[spec.name];
    if (outcome?.status === 'ok' && outcome.at >= state.sentAt) {
      setState(CLOSED);
    }
  }

  const edit = (next: (draft: SelectorDraft) => SelectorDraft) =>
    setState((previous) => ({ ...previous, draft: next(previous.draft), sentAt: null }));
  return {
    target: spec === null || kind === null ? null : { spec, kind },
    draft: state.draft,
    open: (id) => {
      const opened = SELECTORS.find((s) => s.id === id);
      if (opened !== undefined) {
        setState({ id, kind: selectorKind(id, isMach), draft: EMPTY_SELECTOR_DRAFT, sentAt: null });
      }
    },
    digit: (value) => {
      if (kind !== null) {
        edit((draft) => pushSelectorDigit(kind, draft, value));
      }
    },
    erase: () => edit(deleteSelectorDigit),
    clear: () => edit(() => EMPTY_SELECTOR_DRAFT),
    sign: () => {
      if (kind !== null) {
        edit((draft) => toggleSelectorSign(kind, draft));
      }
    },
    cancel: () => setState(CLOSED),
    sent: () => setState((previous) => ({ ...previous, sentAt: now })),
  };
}
