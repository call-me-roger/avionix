import { useState } from 'react';

import { readBackVerdict } from '@/domain/panels/read-back';
import type { DataRefValue } from '@/domain/simulator/types';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface ReadBackRequest {
  /** Where the sentence is shown (a radio, the squawk, the mode). A new watch replaces the old. */
  key: string;
  /** The DataRef expected to change. */
  name: string;
  /** The binding whose operation outcome counts: the DataRef written, or the command activated. */
  operation: string;
  expected: number;
  /** The sentence when X-Plane did not take it, given the value it reports instead. */
  failure: (current: DataRefValue | undefined) => string;
}

export interface ReadBack {
  watch: (request: ReadBackRequest) => void;
  messageFor: (key: string) => string | null;
}

type Watch =
  | { kind: 'watching'; request: ReadBackRequest; startedAt: number }
  | { kind: 'settled'; message: string | null };

/**
 * Checks that X-Plane adopted what a control sent (F-21 R4, F-22 R4). Each watch settles exactly
 * once: a value the pilot later changes in the simulator must not produce a late "did not take".
 * Evaluated during render, which the panel clock drives every second, so no timer of its own; the
 * state is settled with React's adjust-while-rendering pattern (effects may not set state here).
 */
export function useReadBack(): ReadBack {
  const { snapshot, link, now } = usePanel();
  const [watches, setWatches] = useState<Readonly<Record<string, Watch>>>({});

  let settled: Record<string, Watch> | null = null;
  for (const [key, watch] of Object.entries(watches)) {
    if (watch.kind !== 'watching') {
      continue;
    }
    const current = snapshot.telemetry[watch.request.name]?.value;
    const verdict = readBackVerdict({
      current,
      expected: watch.request.expected,
      operation: snapshot.operations[watch.request.operation],
      startedAt: watch.startedAt,
      valuesCurrent: link.valuesCurrent,
      now,
    });
    if (verdict === 'waiting') {
      continue;
    }
    settled ??= { ...watches };
    settled[key] = {
      kind: 'settled',
      message: verdict === 'notAdopted' ? watch.request.failure(current) : null,
    };
  }
  if (settled !== null) {
    setWatches(settled);
  }

  return {
    watch: (request) =>
      setWatches((previous) => ({
        ...previous,
        [request.key]: { kind: 'watching', request, startedAt: now },
      })),
    messageFor: (key) => {
      const watch = watches[key];
      return watch?.kind === 'settled' ? watch.message : null;
    },
  };
}
