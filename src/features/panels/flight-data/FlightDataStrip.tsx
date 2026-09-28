import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { formatClock, formatFuel, formatSpeed, formatWind } from '@/domain/flight-data/format';
import { makeRowStyles } from '@/features/panels/flight-data/rowStyles';
import { SimBadge } from '@/features/panels/flight-data/SimBadge';
import type { FlightValueState } from '@/features/panels/flight-data/useFlightValue';
import { one, useFlightValue } from '@/features/panels/flight-data/useFlightValue';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** R11: the strip only reads. No feature here ever writes or activates. */
const STRIP_ACTIONS: PanelActions = {
  write: async () => undefined,
  activate: async () => undefined,
};

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  target: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    justifyContent: 'center' as const,
  },
  cell: { flex: 1 },
});

/** A missing DataRef costs this one field, never the strip (F-11 R7). */
function cellText(state: FlightValueState): string {
  return state.missing ? 'n/a' : state.text;
}

/** Sim zulu only earns its trailing "Z" over a real clock reading, never over "n/a" or "—". */
function zuluCellText(state: FlightValueState): string {
  if (state.missing) {
    return 'n/a';
  }
  return state.text === '—' ? state.text : `${state.text}Z`;
}

function StripCell({ label, text }: { label: string; text: string }) {
  const layout = useThemedStyles(makeStyles);
  const row = useThemedStyles(makeRowStyles);
  return (
    <View style={layout.cell}>
      <BodyText muted>{label}</BodyText>
      <Text style={row.value}>{text}</Text>
    </View>
  );
}

/**
 * The four values inside `PanelScope`: `useFlightValue` needs the panel context the scope
 * publishes. One accessible name covers the whole row (R7: freshness is the link's, said once).
 */
function StripBody({ onOpen }: { onOpen: (() => void) | null }) {
  const { units } = useUnits();
  const styles = useThemedStyles(makeStyles);
  const groundSpeed = useFlightValue([D.groundSpeed], one(formatSpeed));
  const wind = useFlightValue([D.windDirection, D.windSpeed], ([direction = 0, speed = 0]) =>
    formatWind(direction, speed),
  );
  const fuel = useFlightValue(
    [D.fuelTotal],
    one((kg) => formatFuel(kg, units.fuel)),
  );
  const zulu = useFlightValue([D.zuluTime], one(formatClock));
  const current = groundSpeed.current;

  const groundSpeedText = cellText(groundSpeed);
  const windText = cellText(wind);
  const fuelText = cellText(fuel);
  const zuluText = zuluCellText(zulu);

  const base =
    `Flight data: ground speed ${groundSpeedText}, wind ${windText}, ` +
    `fuel ${fuelText}, sim zulu ${zuluText}${current ? '' : ', not live'}.`;
  const label = onOpen === null ? base : `${base} Open flight data.`;

  const cells = (
    <>
      <StripCell label="Ground speed" text={groundSpeedText} />
      <StripCell label="Wind" text={windText} />
      <StripCell label="Fuel" text={fuelText} />
      <StripCell label="Sim zulu" text={zuluText} />
    </>
  );

  return (
    <>
      <SimBadge />
      {onOpen === null ? (
        <View
          testID="flight-data-strip"
          accessible
          accessibilityLabel={label}
          style={[styles.row, styles.target]}
        >
          {cells}
        </View>
      ) : (
        <Pressable
          testID="flight-data-strip"
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onOpen}
          style={[styles.row, styles.target]}
        >
          {cells}
        </Pressable>
      )}
    </>
  );
}

/**
 * The compact strip docked under the status bar on every panel but Flight data (F-11): ground
 * speed, wind, fuel and sim zulu, plus the sim badge. Read-only, like the panel it summarises.
 */
export function FlightDataStrip({
  snapshot,
  now,
  onOpen,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpen: (() => void) | null;
}) {
  return (
    <PanelScope snapshot={snapshot} now={now} actions={STRIP_ACTIONS}>
      <StripBody onOpen={onOpen} />
    </PanelScope>
  );
}
