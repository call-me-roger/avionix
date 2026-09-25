import React from 'react';
import { Pressable } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { identityLabel } from '@/domain/aircraft/aircraft-identity';
import { type FeatureAvailability, summariseAvailability } from '@/domain/aircraft/availability';
import { SELECTION_LABEL } from '@/domain/aircraft/profile-selection';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { BodyText, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export const UNIDENTIFIED_LABEL = 'X-Plane did not report which aircraft is loaded';

function verdictTone(features: readonly FeatureAvailability[]): 'danger' | 'success' | undefined {
  if (features.some((feature) => feature.status === 'unavailable')) {
    return 'danger';
  }
  return features.every((feature) => feature.status === 'available') ? 'success' : undefined;
}

const makeStyles = (theme: Theme) => ({
  bar: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    // Matches LinkStatusBar's house rule: comfortably above the 44 pt minimum touch target.
    minHeight: 48,
    gap: theme.spacing.xs,
  },
});

/**
 * What the pilot reads at a glance: which aircraft, which profile, and whether anything is
 * missing. Like `LinkStatusBar`, the whole row is the pressable and the action is folded into
 * its own accessibility label — a nested control inside a plain `View` would either collapse
 * for a screen reader or never announce the label at all, leaving no non-visual way to open the
 * compatibility view.
 */
export function AircraftSummary({
  snapshot,
  now,
  onOpenCompatibility,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpenCompatibility: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { compatibility, state } = snapshot;
  const checked = compatibility.checkedAt !== null;
  const aircraft = identityLabel(compatibility.identity) ?? UNIDENTIFIED_LABEL;
  const profile = `${compatibility.profileName} ${compatibility.profileVersion} · ${SELECTION_LABEL[compatibility.selection]}`;
  const verdict = checked ? summariseAvailability(compatibility.features) : 'Not checked yet';
  // Derived, never stored: a result is current exactly while the link that produced it is up.
  const currency =
    state === 'connected' || !checked
      ? null
      : `Checked ${formatAge(ageMs(compatibility.checkedAt, now))} — not current`;

  return (
    <Pressable
      testID="aircraft-summary"
      accessibilityRole="button"
      accessibilityLabel={`Aircraft: ${aircraft}. Profile ${profile}. ${verdict}.${
        currency === null ? '' : ` ${currency}.`
      } Open compatibility details.`}
      onPress={onOpenCompatibility}
      style={styles.bar}
    >
      <SectionTitle>Aircraft</SectionTitle>
      <BodyText>{aircraft}</BodyText>
      <BodyText muted>{profile}</BodyText>
      <BodyText tone={checked ? verdictTone(compatibility.features) : undefined}>
        {verdict}
      </BodyText>
      {currency === null ? null : <BodyText muted>{currency}</BodyText>}
      <BodyText>Compatibility details</BodyText>
    </Pressable>
  );
}
