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

interface UnitMemory {
  seen: boolean;
  extraRows: boolean;
}

const EMPTY_UNIT_MEMORY: UnitMemory = { seen: false, extraRows: false };

/**
 * "Has text appeared since identification" and "have rows 14–15 ever been used", kept per unit so
 * switching CDU 1 → CDU 2 → CDU 1 never resets unit 1's own memory (spec §4.4: "every text line of
 * the selected unit has been blank since the aircraft was identified" — the memory belongs to the
 * unit, not to whichever unit happened to be selected when it last changed). Only an aircraft
 * change (a new `identity`) resets both units' memory.
 */
interface ScreenMemory {
  identity: string;
  units: Record<CduUnit, UnitMemory>;
}

function aircraftKey(identity: {
  description: string | null;
  icaoType: string | null;
  tailNumber: string | null;
}): string {
  return `${identity.description}|${identity.icaoType}|${identity.tailNumber}`;
}

function initialMemory(identity: string): ScreenMemory {
  return { identity, units: { 1: EMPTY_UNIT_MEMORY, 2: EMPTY_UNIT_MEMORY } };
}

/**
 * Reads the default FMS's 16 text and style lines for one unit and reduces them to what the panel
 * draws. The per-unit memory above is kept as state adjusted during render (React's documented
 * pattern for resetting derived state on a prop change, as ControlButton does for `armed`): the
 * next value is a pure function of the current one and this render's lines, and setting it is a
 * no-op once it already matches, so this never loops.
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

  const [memory, setMemory] = useState<ScreenMemory>(() => initialMemory(identityNow));
  const identityChanged = memory.identity !== identityNow;
  const baseUnits: Record<CduUnit, UnitMemory> = identityChanged
    ? { 1: EMPTY_UNIT_MEMORY, 2: EMPTY_UNIT_MEMORY }
    : memory.units;
  const currentUnit = baseUnits[unit];
  const nextSeen = currentUnit.seen || nonBlankNow;
  const nextExtraRows = currentUnit.extraRows || extraNow;
  if (identityChanged || nextSeen !== currentUnit.seen || nextExtraRows !== currentUnit.extraRows) {
    setMemory({
      identity: identityNow,
      units: { ...baseUnits, [unit]: { seen: nextSeen, extraRows: nextExtraRows } },
    });
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

  return {
    state,
    rows: rows.slice(0, rowCount),
    execLit: (firstNumber(snapshot.telemetry[cduExecLight(unit)]?.value) ?? 0) !== 0,
    aircraftName: identity.description ?? identity.icaoType ?? 'This aircraft',
    stale: !link.valuesCurrent,
  };
}
