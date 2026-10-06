import { useState } from 'react';

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

/**
 * "Has text appeared since identification", and "have rows 14–15 ever been used": both reset when
 * the aircraft changes (a new `key`), and are otherwise sticky for the session (spec §4.4, §4.3).
 */
interface ScreenMemory {
  key: string;
  seen: boolean;
  extraRows: boolean;
}

function identityKey(
  unit: CduUnit,
  identity: { description: string | null; icaoType: string | null; tailNumber: string | null },
): string {
  return `${unit}|${identity.description}|${identity.icaoType}|${identity.tailNumber}`;
}

/**
 * Reads the default FMS's 16 text and style lines for one unit and reduces them to what the panel
 * draws. "Seen since identification" is kept as state adjusted during render (React's documented
 * pattern for resetting derived state on a prop change, as ControlButton does for `armed`): the
 * next value is a pure function of the current one and this render's lines, and setting it is a
 * no-op once it already matches, so this never loops.
 */
export function useCduScreen(unit: CduUnit): CduScreenValues {
  const { snapshot, link } = usePanel();
  const { identity } = snapshot.compatibility;
  const key = identityKey(unit, identity);

  const textLines: (string[] | null)[] = [];
  const styleLines: number[][] = [];
  for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
    textLines.push(decodeTextLine(snapshot.telemetry[cduTextLine(unit, line)]?.value));
    styleLines.push(decodeStyleLine(snapshot.telemetry[cduStyleLine(unit, line)]?.value));
  }

  const waiting = textLines.some((line) => line === null);
  const nonBlankNow = textLines.some((line) => line !== null && !isBlankLine(line));
  const extraNow = [14, 15].some((index) => {
    const line = textLines[index] ?? null;
    return line !== null && !isBlankLine(line);
  });

  const [memory, setMemory] = useState<ScreenMemory>(() => ({
    key,
    seen: false,
    extraRows: false,
  }));
  const keyChanged = memory.key !== key;
  const nextSeen = (keyChanged ? false : memory.seen) || nonBlankNow;
  const nextExtraRows = (keyChanged ? false : memory.extraRows) || extraNow;
  if (keyChanged || nextSeen !== memory.seen || nextExtraRows !== memory.extraRows) {
    setMemory({ key, seen: nextSeen, extraRows: nextExtraRows });
  }

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
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    text: (textLines[index] ?? BLANK_LINE).join(''),
    style: String.fromCharCode(...(styleLines[index] ?? [])),
  }));

  return {
    state,
    rows,
    execLit: (firstNumber(snapshot.telemetry[cduExecLight(unit)]?.value) ?? 0) !== 0,
    aircraftName: identity.description ?? identity.icaoType ?? 'This aircraft',
    stale: !link.valuesCurrent,
  };
}
