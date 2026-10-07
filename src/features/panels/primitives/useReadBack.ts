import { useEffect, useRef, useState } from 'react';

import { readBackVerdict } from '@/domain/panels/read-back';
import type { DataRefValue } from '@/domain/simulator/types';
import { useHaptics } from '@/features/haptics/HapticsProvider';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface ReadBackRequest {
  /** Where the sentence is shown (a radio, the squawk, the mode). A new watch replaces the old. */
  key: string;
  /** The DataRef expected to change. */
  name: string;
  /** The binding whose operation outcome counts: the DataRef written, or the command activated. */
  operation: string;
  expected: number;
  /**
   * Decides adoption instead of `readsAs(current, expected)`: for values where half a unit is the
   * whole range (Mach), that wrap (a heading of 0 read back as 359.9), or a change of state.
   */
  matches?: (value: DataRefValue | undefined) => boolean;
  /** The sentence when X-Plane did not take it, given the value it reports instead. */
  failure: (current: DataRefValue | undefined) => string;
}

export interface ReadBack {
  watch: (request: ReadBackRequest) => void;
  /** Forgets a key's watch and sentence: a press that needed no watch outdates the last one. */
  clear: (key: string) => void;
  messageFor: (key: string) => string | null;
  /** The value a still-waiting watch expects: what the panel last sent and X-Plane has not shown. */
  pendingExpected: (key: string) => number | null;
}

type Watch =
  | { kind: 'watching'; request: ReadBackRequest; startedAt: number }
  | { kind: 'settled'; message: string | null };

interface ReadBackState {
  watches: Readonly<Record<string, Watch>>;
  /** Counts failures settled, so the haptic effect below fires once per new one, never on mount. */
  failures: number;
}

/**
 * Checks that X-Plane adopted what a control sent (F-21 R4, F-22 R4). Each watch settles exactly
 * once: a value the pilot later changes in the simulator must not produce a late "did not take".
 * Evaluated during render, which the panel clock drives every second, so no timer of its own; the
 * state is settled with React's adjust-while-rendering pattern (effects may not set state here).
 * A settled failure also fires a haptic buzz, from an effect, never during render.
 */
export function useReadBack(): ReadBack {
  const { snapshot, link, now } = usePanel();
  const { failure } = useHaptics();
  const [state, setState] = useState<ReadBackState>({ watches: {}, failures: 0 });
  const { watches } = state;

  let settledWatches: Record<string, Watch> | null = null;
  let newFailures = 0;
  for (const [key, watch] of Object.entries(watches)) {
    if (watch.kind !== 'watching') {
      continue;
    }
    const current = snapshot.telemetry[watch.request.name]?.value;
    const verdict = readBackVerdict({
      current,
      expected: watch.request.expected,
      matches: watch.request.matches,
      operation: snapshot.operations[watch.request.operation],
      startedAt: watch.startedAt,
      valuesCurrent: link.valuesCurrent,
      now,
    });
    if (verdict === 'waiting') {
      continue;
    }
    settledWatches ??= { ...watches };
    const message = verdict === 'notAdopted' ? watch.request.failure(current) : null;
    settledWatches[key] = { kind: 'settled', message };
    if (message !== null) {
      newFailures += 1;
    }
  }
  if (settledWatches !== null) {
    const finalWatches = settledWatches;
    setState((previous) => ({
      watches: finalWatches,
      failures: previous.failures + newFailures,
    }));
  }

  // Once per new failure, never again for one already buzzed: a new `failure` (the haptics
  // preference toggled) re-runs this effect with the same count.
  const buzzedFor = useRef(0);
  useEffect(() => {
    if (state.failures > buzzedFor.current) {
      buzzedFor.current = state.failures;
      failure();
    }
  }, [state.failures, failure]);

  return {
    watch: (request) =>
      setState((previous) => ({
        ...previous,
        watches: {
          ...previous.watches,
          [request.key]: { kind: 'watching', request, startedAt: now },
        },
      })),
    clear: (key) =>
      setState((previous) => {
        if (!(key in previous.watches)) {
          return previous;
        }
        const { [key]: _cleared, ...rest } = previous.watches;
        return { ...previous, watches: rest };
      }),
    messageFor: (key) => {
      const watch = watches[key];
      return watch?.kind === 'settled' ? watch.message : null;
    },
    pendingExpected: (key) => {
      // `settledWatches` holds this render's verdicts before React applies them.
      const watch = (settledWatches ?? watches)[key];
      return watch?.kind === 'watching' ? watch.request.expected : null;
    },
  };
}
