import React, { useState } from 'react';
import { Button, View } from 'react-native';

import type { LastOperation } from '@/application/session-snapshot';
import type { FeatureAvailability } from '@/domain/aircraft/availability';
import { FailureNotice } from '@/features/health/FailureNotice';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  enabled: boolean;
  feature: FeatureAvailability | null;
  lastOperation: LastOperation | null;
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
  const available = props.feature?.status === 'available';
  const usable = props.enabled && available;
  const reason =
    available || props.feature === null
      ? null
      : `Heading control is not available on this aircraft: ${props.feature.missing
          .map((miss) => miss.purpose)
          .join(', ')}`;
  const canWrite = usable && heading.trim() !== '' && Number.isFinite(parsed);
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
      <View style={styles.row}>
        <Button
          title="Write heading"
          onPress={() => props.onWriteHeading(parsed)}
          disabled={!canWrite}
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
      <LastOperationRow lastOperation={props.lastOperation} />
    </Section>
  );
}

/**
 * `lastOperation.message` is safe to render only for the success copy and for the plain-language
 * validation messages this component synthesizes itself (never for an `AvionixError`-derived
 * failure, which carries `failure` instead and must go through `FailureNotice` — F-02 R9).
 */
function LastOperationRow({ lastOperation }: { lastOperation: LastOperation | null }) {
  if (lastOperation === null) {
    return <BodyText>Last operation: -</BodyText>;
  }
  if (lastOperation.ok) {
    return <BodyText>{`Last operation: OK ${lastOperation.message}`}</BodyText>;
  }
  if (lastOperation.failure === null) {
    return <BodyText tone="danger">{`Last operation: FAILED ${lastOperation.message}`}</BodyText>;
  }
  return (
    <View>
      <BodyText tone="danger">Last operation: FAILED</BodyText>
      <FailureNotice code={lastOperation.failure.code} step={lastOperation.failure.step} />
    </View>
  );
}
