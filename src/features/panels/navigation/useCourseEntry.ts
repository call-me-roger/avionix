import { useState } from 'react';

import {
  EMPTY_SELECTOR_DRAFT,
  type SelectorDraft,
  deleteSelectorDigit,
  pushSelectorDigit,
} from '@/domain/autopilot/selector-entry';
import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface CourseEntry {
  isOpen: boolean;
  draft: SelectorDraft;
  open: () => void;
  digit: (value: number) => void;
  erase: () => void;
  clear: () => void;
  cancel: () => void;
  /** Set was pressed: close once X-Plane accepts the write, keep the draft if it fails. */
  sent: () => void;
}

interface State {
  open: boolean;
  draft: SelectorDraft;
  sentAt: number | null;
}

const CLOSED: State = { open: false, draft: EMPTY_SELECTOR_DRAFT, sentAt: null };

/**
 * The staged course entry, on `useSelectorEntry`'s rules: dropped — never kept — when controls go
 * inert, and closed once X-Plane's course reads back what was sent. Resets adjust state while
 * rendering (no effects). The course is always the `heading` selector kind (spec §4), so there is
 * no `target`/`kind` to track, unlike the autopilot's multi-selector entry.
 */
export function useCourseEntry(): CourseEntry {
  const { snapshot, link, now } = usePanel();
  const [state, setState] = useState<State>(CLOSED);

  if (state.open && !link.controlsEnabled) {
    setState(CLOSED);
  } else if (state.open && state.sentAt !== null) {
    const outcome = snapshot.operations[D.hsiCourse];
    if (outcome?.status === 'ok' && outcome.at >= state.sentAt) {
      setState(CLOSED);
    }
  }

  const edit = (next: (draft: SelectorDraft) => SelectorDraft) =>
    setState((previous) => ({ ...previous, draft: next(previous.draft), sentAt: null }));

  return {
    isOpen: state.open,
    draft: state.draft,
    open: () => setState({ open: true, draft: EMPTY_SELECTOR_DRAFT, sentAt: null }),
    digit: (value) => edit((draft) => pushSelectorDigit('heading', draft, value)),
    erase: () => edit(deleteSelectorDigit),
    clear: () => edit(() => EMPTY_SELECTOR_DRAFT),
    cancel: () => setState(CLOSED),
    sent: () => setState((previous) => ({ ...previous, sentAt: now })),
  };
}
