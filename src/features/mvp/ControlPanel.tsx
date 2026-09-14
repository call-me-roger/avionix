import React, { useState } from 'react';
import { Button, View } from 'react-native';

import type { LastOperation } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  enabled: boolean;
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
  const canWrite = props.enabled && heading.trim() !== '' && Number.isFinite(parsed);
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
          disabled={!props.enabled}
          color={theme.colors.primary}
        />
      </View>
      <BodyText
        tone={props.lastOperation === null || props.lastOperation.ok ? undefined : 'danger'}
      >
        Last operation:{' '}
        {props.lastOperation === null
          ? '-'
          : `${props.lastOperation.ok ? 'OK' : 'FAILED'} ${props.lastOperation.message}`}
      </BodyText>
    </Section>
  );
}
