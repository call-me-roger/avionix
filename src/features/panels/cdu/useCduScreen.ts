import { useEffect, useSyncExternalStore } from 'react';

import { featureOf } from '@/application/compatibility';
import { cduScreenFeatureId } from '@/domain/aircraft/profiles/generic';
import {
  CDU_LINE_COUNT,
  type CduUnit,
  cduExecLight,
  cduStyleLine,
  cduTextLine,
} from '@/domain/cdu/keys';
import {
  CDU_BASE_ROWS,
  CDU_COLUMNS,
  decodeStyleLine,
  decodeTextLine,
  isBlankLine,
} from '@/domain/cdu/screen';
import {
  EMPTY_UNIT_MEMORY,
  useCduScreenMemoryStore,
} from '@/features/panels/cdu/cdu-screen-memory';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export type CduScreenState = 'unavailable' | 'waiting' | 'noFms' | 'live';

export interface CduScreenValues {
  state: CduScreenState;
  /** One entry per drawn row (14, or 16 once rows 14–15 have been used): text and style as strings. */
  rows: { text: string; style: string }[];
  execLit: boolean;
  aircraftName: string;
  stale: boolean;
}

const BLANK_LINE = Array.from({ length: CDU_COLUMNS }, () => ' ');

function aircraftKey(identity: {
  description: string | null;
  icaoType: string | null;
  tailNumber: string | null;
}): string {
  return `${identity.description}|${identity.icaoType}|${identity.tailNumber}`;
}

/**
 * Reads the default FMS's 16 text and style lines for one unit and reduces them to what the panel
 * draws. The per-unit "seen" and rows 14–15 memory lives in a `CduScreenMemoryStore` that outlives
 * the panel (`cdu-screen-memory.ts`). This render's values are a pure function of what the store
 * remembers and this render's lines; an effect then records them, a no-op once the store already
 * matches, so this never loops.
 */
export function useCduScreen(unit: CduUnit): CduScreenValues {
  const { snapshot, link } = usePanel();
  const { identity } = snapshot.compatibility;
  const identityNow = aircraftKey(identity);

  const textLines: (string[] | null)[] = [];
  const rows: { text: string; style: string }[] = [];
  for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
    const textLine = decodeTextLine(snapshot.telemetry[cduTextLine(unit, line)]?.value);
    const styleLine = decodeStyleLine(snapshot.telemetry[cduStyleLine(unit, line)]?.value);
    textLines.push(textLine);
    rows.push({
      text: (textLine ?? BLANK_LINE).join(''),
      style: String.fromCharCode(...styleLine),
    });
  }

  const waiting = textLines.some((line) => line === null);
  const nonBlankNow = textLines.some((line) => line !== null && !isBlankLine(line));
  const extraNow = [14, 15].some((index) => {
    const line = textLines[index] ?? null;
    return line !== null && !isBlankLine(line);
  });

  const store = useCduScreenMemoryStore();
  const memory = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Another aircraft's memory counts for nothing: a new identity starts both units afresh.
  const remembered =
    memory !== null && memory.identity === identityNow ? memory.units[unit] : EMPTY_UNIT_MEMORY;
  const nextSeen = remembered.seen || nonBlankNow;
  const nextExtraRows = remembered.extraRows || extraNow;
  useEffect(() => {
    store.record(identityNow, unit, { seen: nextSeen, extraRows: nextExtraRows });
  }, [store, identityNow, unit, nextSeen, nextExtraRows]);

  const feature = featureOf(snapshot.compatibility, cduScreenFeatureId(unit));
  const state: CduScreenState =
    feature === null || feature.status === 'unavailable'
      ? 'unavailable'
      : waiting
        ? 'waiting'
        : nextSeen
          ? 'live'
          : 'noFms';

  const rowCount = CDU_BASE_ROWS + (nextExtraRows ? 2 : 0);

  return {
    state,
    rows: rows.slice(0, rowCount),
    execLit: (firstNumber(snapshot.telemetry[cduExecLight(unit)]?.value) ?? 0) !== 0,
    aircraftName: identity.description ?? identity.icaoType ?? 'This aircraft',
    stale: !link.valuesCurrent,
  };
}
