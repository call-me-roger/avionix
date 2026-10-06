import { useState } from 'react';

import { deleteDigit, pushDigit } from '@/domain/radios/entry';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { type EntryTarget, type EntryTargetId, entryTarget } from '@/features/panels/radios/radios';

export interface RadioEntry {
  target: EntryTarget | null;
  draft: string;
  open: (id: EntryTargetId) => void;
  digit: (value: number) => void;
  erase: () => void;
  clear: () => void;
  cancel: () => void;
  /** Set was pressed: close once X-Plane accepts the write, keep the draft if it fails. */
  sent: () => void;
}

interface State {
  id: EntryTargetId | null;
  draft: string;
  sentAt: number | null;
}

const CLOSED: State = { id: null, draft: '', sentAt: null };

/**
 * The staged entry (F-21 C2, F-22 T2). One target at a time. The draft is dropped — never kept for
 * later — when controls go inert, so a reconnect can never be followed by sending a stale intent
 * with one tap (C6, T8). Both resets adjust state while rendering, React's documented pattern for
 * deriving state from props; effects may not set state in this repo.
 */
export function useRadioEntry(): RadioEntry {
  const { snapshot, link, now } = usePanel();
  const [state, setState] = useState<State>(CLOSED);
  const target = state.id === null ? null : entryTarget(state.id);

  if (target !== null && !link.controlsEnabled) {
    setState(CLOSED);
  } else if (target !== null && state.sentAt !== null) {
    const outcome = snapshot.operations[target.name];
    if (outcome?.status === 'ok' && outcome.at >= state.sentAt) {
      setState(CLOSED);
    }
  }

  const edit = (next: (draft: string) => string) =>
    setState((previous) => ({ ...previous, draft: next(previous.draft), sentAt: null }));
  return {
    target,
    draft: state.draft,
    open: (id) => setState({ id, draft: '', sentAt: null }),
    digit: (value) => {
      if (target !== null) {
        edit((draft) => pushDigit(target.kind, draft, value));
      }
    },
    erase: () => edit(deleteDigit),
    clear: () => edit(() => ''),
    cancel: () => setState(CLOSED),
    sent: () => setState((previous) => ({ ...previous, sentAt: now })),
  };
}
