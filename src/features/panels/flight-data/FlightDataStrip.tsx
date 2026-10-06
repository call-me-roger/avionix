import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { formatClock, formatFuel, formatSpeed, formatWind } from '@/domain/flight-data/format';
import { simulatorBadge } from '@/domain/flight-data/sim-state';
import { makeRowStyles } from '@/features/panels/flight-data/rowStyles';
import { SimBadge } from '@/features/panels/flight-data/SimBadge';
import type { FlightValueState } from '@/features/panels/flight-data/useFlightValue';
import { one, useFlightValue } from '@/features/panels/flight-data/useFlightValue';
import { type PanelActions, usePanel } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** R11: the strip only reads. No feature here ever writes or activates. */
const STRIP_ACTIONS: PanelActions = {
  write: async () => undefined,
  activate: async () => 'refused',
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
  // SimBadge sets alignSelf: 'flex-start' on its own View for the panel's column layout; wrapping
  // it isolates that alignSelf to this wrapper's (column) cross axis, so the wrapper itself still
  // takes the row's alignItems: 'center' and the badge sits centred in the strip.
  badgeWrap: {},
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

function StripCell({ label, text, current }: { label: string; text: string; current: boolean }) {
  const layout = useThemedStyles(makeStyles);
  const row = useThemedStyles(makeRowStyles);
  return (
    <View style={layout.cell}>
      <Text style={row.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[row.value, current ? null : row.stale]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * The four values inside `PanelScope`: `useFlightValue` needs the panel context the scope
 * publishes. One accessible name covers the whole row (R7: freshness is the link's, said once).
 */
function StripBody({
  onOpen,
  safeArea,
}: {
  onOpen: (() => void) | null;
  safeArea?: { left?: number; right?: number };
}) {
  const { units } = useUnits();
  const { snapshot } = usePanel();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Matches LinkStatusBar's own gutter directly above: the same side inset plus the same base
  // spacing, now that neither of them gets it for free from a shared wrap padding any more.
  const gutter = {
    paddingLeft: (safeArea?.left ?? 0) + theme.spacing.lg,
    paddingRight: (safeArea?.right ?? 0) + theme.spacing.lg,
  };
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

  // The strip's single accessible element replaces its children's individual accessibility on a
  // device, so the nested SimBadge's own "X-Plane is paused"/"X-Plane is in replay" label would
  // otherwise be unreachable. Say it once, here, in the strip's own name instead.
  const badge = simulatorBadge(
    snapshot.state,
    snapshot.health.activity,
    snapshot.telemetry[D.inReplay]?.value,
  );
  const badgePhrase =
    badge === null ? '' : badge === 'paused' ? ', X-Plane is paused' : ', X-Plane is in replay';

  const base =
    `Flight data: ground speed ${groundSpeedText}, wind ${windText}, ` +
    `fuel ${fuelText}, sim zulu ${zuluText}${badgePhrase}${current ? '' : ', not live'}.`;
  const label = onOpen === null ? base : `${base} Open flight data.`;

  const cells = (
    <>
      <StripCell label="GS" text={groundSpeedText} current={current} />
      <StripCell label="Wind" text={windText} current={current} />
      <StripCell label="Fuel" text={fuelText} current={current} />
      <StripCell label="Zulu" text={zuluText} current={current} />
    </>
  );

  // The badge and the "not live" marker sit inline at the end of the row, not above it, so
  // pausing/unpausing (or a link drop) never changes the strip's height (F-11 final-fixes #3).
  const trailer = (
    <>
      <View style={styles.badgeWrap}>
        <SimBadge />
      </View>
      {current ? null : <BodyText muted>not live</BodyText>}
    </>
  );

  return onOpen === null ? (
    <View
      testID="flight-data-strip"
      accessible
      accessibilityLabel={label}
      style={[styles.row, styles.target, gutter]}
    >
      {cells}
      {trailer}
    </View>
  ) : (
    <Pressable
      testID="flight-data-strip"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onOpen}
      style={[styles.row, styles.target, gutter]}
    >
      {cells}
      {trailer}
    </Pressable>
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
  safeArea,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpen: (() => void) | null;
  /** The system-area inset on each side, matching LinkStatusBar's own gutter above it. */
  safeArea?: { left?: number; right?: number };
}) {
  return (
    <PanelScope snapshot={snapshot} now={now} actions={STRIP_ACTIONS}>
      <StripBody onOpen={onOpen} safeArea={safeArea} />
    </PanelScope>
  );
}
