import React from 'react';
import { Text, View } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { type ModeStatuses, annunciationText } from '@/domain/autopilot/modes';
import { autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  stale: { color: theme.colors.textMuted },
});

/** One line like a flight-mode annunciator, only from X-Plane's status DataRefs (R2, R5). */
export function Annunciator() {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const read = (name: string) => autopilotNumber(snapshot, name);
  const statuses: ModeStatuses = {
    hdg: read(D.headingStatus),
    nav: read(D.navStatus),
    apr: read(D.approachStatus),
    alt: read(D.altitudeStatus),
    vs: read(D.verticalSpeedStatus),
    flc: read(D.speedStatus),
    gs: read(D.glideslopeStatus),
    rol: read(D.rollStatus),
    pit: read(D.pitchStatus),
  };
  const autothrottle = read(D.autothrottle);
  const text = annunciationText(statuses, autothrottle);
  // "not live" qualifies a value; with no flight there is none, and the panel notice explains.
  const hasValue = autothrottle !== null || Object.values(statuses).some((value) => value !== null);
  const notLive = !link.valuesCurrent && hasValue;
  return (
    <View
      testID="autopilot-annunciator"
      style={styles.wrap}
      accessible
      accessibilityLabel={`Autopilot modes: ${text}${notLive ? ', not live' : ''}`}
    >
      <Text style={[styles.text, link.valuesCurrent ? null : styles.stale]}>{text}</Text>
      {notLive ? <BodyText muted>not live</BodyText> : null}
    </View>
  );
}
