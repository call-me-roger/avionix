import React from 'react';
import { Text, View } from 'react-native';

import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { SIM_BADGE_LABEL, simulatorBadge } from '@/domain/flight-data/sim-state';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  badge: {
    alignSelf: 'flex-start' as const,
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  text: {
    color: theme.colors.danger,
    fontWeight: 'bold' as const,
    fontSize: theme.typography.bodySize,
  },
});

/** F-11 R3: PAUSED or REPLAY, whichever explains the numbers. Nothing to say → nothing rendered. */
export function SimBadge() {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const badge = simulatorBadge(
    snapshot.state,
    snapshot.health.activity,
    snapshot.telemetry[GENERIC_DATAREFS.inReplay]?.value,
  );
  if (badge === null) {
    return null;
  }
  return (
    <View
      style={styles.badge}
      accessible
      accessibilityRole="text"
      accessibilityLabel={badge === 'paused' ? 'X-Plane is paused' : 'X-Plane is in replay'}
    >
      <Text style={styles.text}>{SIM_BADGE_LABEL[badge]}</Text>
    </View>
  );
}
