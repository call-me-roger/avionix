import React from 'react';
import { Button } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { identityLabel } from '@/domain/aircraft/aircraft-identity';
import { type FeatureAvailability, summariseAvailability } from '@/domain/aircraft/availability';
import { SELECTION_LABEL } from '@/domain/aircraft/profile-selection';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

export const UNIDENTIFIED_LABEL = 'X-Plane did not report which aircraft is loaded';

function verdictTone(features: readonly FeatureAvailability[]): 'danger' | 'success' | undefined {
  if (features.some((feature) => feature.status === 'unavailable')) {
    return 'danger';
  }
  return features.every((feature) => feature.status === 'available') ? 'success' : undefined;
}

/**
 * What the pilot reads at a glance: which aircraft, which profile, and whether anything is
 * missing. The detail — and every DataRef name — lives one tap away in the compatibility view.
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
  const theme = useTheme();
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
    <Section
      testID="aircraft-summary"
      accessibilityLabel={`Aircraft: ${aircraft}. Profile ${profile}. ${verdict}.${
        currency === null ? '' : ` ${currency}.`
      }`}
    >
      <SectionTitle>Aircraft</SectionTitle>
      <BodyText>{aircraft}</BodyText>
      <BodyText muted>{profile}</BodyText>
      <BodyText tone={checked ? verdictTone(compatibility.features) : undefined}>
        {verdict}
      </BodyText>
      {currency === null ? null : <BodyText muted>{currency}</BodyText>}
      <Button
        title="Compatibility details"
        onPress={onOpenCompatibility}
        color={theme.colors.primary}
      />
    </Section>
  );
}
