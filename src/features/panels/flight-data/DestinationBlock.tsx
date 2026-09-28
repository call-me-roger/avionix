import React from 'react';
import { Text, View } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { destinationView } from '@/domain/flight-data/destination';
import { formatDistance, formatTimeToGo } from '@/domain/flight-data/format';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
});

const LABEL = 'GPS destination';

/**
 * The default GPS's active destination (F-11 R8). Shown only when the aircraft populates it and
 * one is actually set; otherwise the reason is said in words, never a bare dash or a zero distance.
 */
export function DestinationBlock() {
  const { snapshot, link } = usePanel();
  const { units } = useUnits();
  const styles = useThemedStyles(makeStyles);
  const view = destinationView({
    idStatus: snapshot.compatibility.bindings[D.gpsDestinationId]?.status,
    distanceStatus: snapshot.compatibility.bindings[D.gpsDistance]?.status,
    idValue: snapshot.telemetry[D.gpsDestinationId]?.value,
    distanceValue: snapshot.telemetry[D.gpsDistance]?.value,
    timeValue: snapshot.telemetry[D.gpsTimeToGo]?.value,
  });

  if (view.kind === 'unavailable') {
    return <BodyText muted>No destination available on this aircraft.</BodyText>;
  }
  if (view.kind === 'notSet') {
    return <BodyText muted>No destination set in the GPS.</BodyText>;
  }

  const text =
    view.kind === 'waiting'
      ? '—'
      : `${view.id}, ${formatDistance(view.distanceNm, units.distance)}${
          view.timeMin === null ? '' : `, ${formatTimeToGo(view.timeMin)}`
        }`;
  const current = link.valuesCurrent;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${LABEL}: ${text}${current ? '' : ', not live'}`}
    >
      <BodyText>{LABEL}</BodyText>
      <Text style={[styles.value, current ? null : styles.stale]}>{text}</Text>
      {current ? null : <BodyText muted>not live</BodyText>}
    </View>
  );
}
