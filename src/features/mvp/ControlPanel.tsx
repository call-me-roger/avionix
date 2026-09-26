import React, { useState } from 'react';
import { Button, View } from 'react-native';

import type { OperationOutcome, SessionSnapshot } from '@/application/session-snapshot';
import type { FeatureAvailability } from '@/domain/aircraft/availability';
import { GENERIC_COMMANDS, GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { FailureNotice } from '@/features/health/FailureNotice';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  enabled: boolean;
  feature: FeatureAvailability | null;
  operations: SessionSnapshot['operations'];
  onWriteHeading: (value: number) => void;
  onHeadingUp: () => void;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md, marginBottom: theme.spacing.sm },
});

export function ControlPanel(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [heading, setHeading] = useState('90');
  const parsed = Number(heading);
  // Matches `featureUsable` in simulator-session.ts exactly: `partial` still has controls to
  // offer, since it exists precisely for a feature missing only an optional binding (R6).
  const usableStatus = props.feature?.status === 'available' || props.feature?.status === 'partial';
  const usable = props.enabled && usableStatus;
  const reason = reasonFor(props.feature, usableStatus);
  const inRange = heading.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 360;
  return (
    <Section>
      <SectionTitle>Test controls</SectionTitle>
      <BodyText>Heading bug to write (0-360)</BodyText>
      <ThemedTextInput
        accessibilityLabel="Heading to write"
        value={heading}
        onChangeText={setHeading}
        keyboardType="numeric"
      />
      {heading.trim() !== '' && !inRange ? (
        <BodyText tone="danger">Heading must be between 0 and 360</BodyText>
      ) : null}
      <View style={styles.row}>
        <Button
          title="Write heading"
          onPress={() => props.onWriteHeading(parsed)}
          disabled={!usable || !inRange}
          color={theme.colors.primary}
        />
        <Button
          title="Heading up"
          onPress={props.onHeadingUp}
          disabled={!usable}
          color={theme.colors.primary}
        />
      </View>
      {reason === null ? null : <BodyText muted>{reason}</BodyText>}
      <OutcomeRow label="Heading write" outcome={props.operations[GENERIC_DATAREFS.headingBug]} />
      <OutcomeRow label="Heading up" outcome={props.operations[GENERIC_COMMANDS.headingUp]} />
    </Section>
  );
}

/**
 * A reason renders only when the control is genuinely inert. `unknown` must not borrow
 * `unavailable`'s wording: `deriveFeatureAvailability` guarantees `missing: []` for `unknown`, so
 * that branch would otherwise print "... is not available on this aircraft: " with nothing after
 * the colon, claiming "not available" when the truth is "not checked yet".
 */
function reasonFor(feature: FeatureAvailability | null, usableStatus: boolean): string | null {
  if (feature === null || usableStatus) {
    return null;
  }
  if (feature.status === 'unknown') {
    return `${feature.label} has not been checked yet.`;
  }
  return `${feature.label} is not available on this aircraft: ${feature.missing
    .map((miss) => miss.purpose)
    .join(', ')}`;
}

/** A failure renders only through FailureNotice (F-02 R9); a refusal in fixed plain words. */
function OutcomeRow({ label, outcome }: { label: string; outcome: OperationOutcome | undefined }) {
  if (outcome === undefined || outcome.status === 'pending') {
    return null;
  }
  if (outcome.status === 'ok') {
    return <BodyText>{`${label}: OK`}</BodyText>;
  }
  if (outcome.failure !== null) {
    return (
      <View>
        <BodyText tone="danger">{`${label}: FAILED`}</BodyText>
        <FailureNotice code={outcome.failure.code} step={outcome.failure.step} />
      </View>
    );
  }
  return (
    <BodyText tone="danger">
      {outcome.refusal === 'notConnected'
        ? `${label}: not sent, Avionix is not connected to X-Plane`
        : `${label}: not sent, not available on this aircraft`}
    </BodyText>
  );
}
