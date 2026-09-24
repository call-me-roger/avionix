import React from 'react';
import { Button, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { identityLabel } from '@/domain/aircraft/aircraft-identity';
import {
  BINDING_MISS_LABEL,
  FEATURE_STATUS_LABEL,
  type FeatureAvailability,
  type FeatureStatus,
} from '@/domain/aircraft/availability';
import { SELECTION_LABEL } from '@/domain/aircraft/profile-selection';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { UNIDENTIFIED_LABEL } from '@/features/aircraft/AircraftSummary';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

function statusTone(status: FeatureStatus): 'danger' | 'success' | undefined {
  if (status === 'available') {
    return 'success';
  }
  return status === 'unavailable' ? 'danger' : undefined;
}

const makeStyles = (theme: Theme) => ({
  feature: { marginTop: theme.spacing.sm },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
});

function FeatureRow({ feature }: { feature: FeatureAvailability }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.feature}>
      <View style={styles.row}>
        <BodyText>{feature.label}</BodyText>
        <BodyText tone={statusTone(feature.status)}>
          {FEATURE_STATUS_LABEL[feature.status]}
        </BodyText>
      </View>
      {feature.missing.map((miss) => (
        <BodyText
          key={miss.name}
          muted
        >{`${miss.purpose} — ${miss.name} — ${BINDING_MISS_LABEL[miss.status]}`}</BodyText>
      ))}
    </View>
  );
}

/**
 * Where a pilot finds out what this aircraft can and cannot do, and why. Naming the DataRef is
 * the point (R7): it is what turns "the autopilot button does nothing" into a bug report. No
 * failure text is composed here — nothing on this screen comes from an `AvionixError`.
 */
export function CompatibilityScreen({
  snapshot,
  now,
  onRecheck,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onRecheck: () => void;
}) {
  const theme = useTheme();
  const { compatibility, state } = snapshot;
  const connected = state === 'connected';
  const checked = compatibility.checkedAt !== null;

  return (
    <Section testID="compatibility-screen">
      <SectionTitle>Aircraft compatibility</SectionTitle>
      {connected ? null : (
        <BodyText muted>
          {checked
            ? `Last checked ${formatAge(ageMs(compatibility.checkedAt, now))}. Not current.`
            : 'Not checked yet. Connect to X-Plane to check this aircraft.'}
        </BodyText>
      )}
      <BodyText>{identityLabel(compatibility.identity) ?? UNIDENTIFIED_LABEL}</BodyText>
      {compatibility.identified ? null : (
        <BodyText muted>Avionix is using the generic profile.</BodyText>
      )}
      {compatibility.identity.addOnVersion === null ? null : (
        <BodyText muted>{`Add-on version ${compatibility.identity.addOnVersion}`}</BodyText>
      )}
      <BodyText muted>
        {`Profile: ${compatibility.profileName} ${compatibility.profileVersion} (${SELECTION_LABEL[compatibility.selection]})`}
      </BodyText>
      {compatibility.testedWith.length === 0 ? null : (
        <BodyText muted>{`Tested with ${compatibility.testedWith.join(', ')}`}</BodyText>
      )}
      {compatibility.versionWarning === null ? null : (
        <BodyText tone="danger">{compatibility.versionWarning}</BodyText>
      )}
      {compatibility.features.map((feature) => (
        <FeatureRow key={feature.id} feature={feature} />
      ))}
      {compatibility.writabilityReported ? null : (
        <BodyText muted>
          This X-Plane version does not report which values can be written, so a control may still
          be refused.
        </BodyText>
      )}
      <Button
        title="Check again"
        onPress={onRecheck}
        disabled={!connected}
        color={theme.colors.primary}
      />
    </Section>
  );
}
