import React, { useState } from 'react';
import { View } from 'react-native';

import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { BodyText, ThemedTextInput } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.touch.spacing,
  },
  input: {
    flex: 1,
    minHeight: theme.touch.minTarget,
    fontSize: theme.typography.titleSize,
    marginBottom: 0,
  },
});

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

interface Props {
  label: string;
  featureId: string;
  target: string;
  min: number;
  max: number;
  unit?: string;
  onSubmit: (value: number) => void;
}

/**
 * A number the pilot types and sends with Set. Validation is in the pilot's words and happens
 * here, before anything is sent; the draft survives a failed write so it can be retried, and the
 * value shown elsewhere stays the simulator's (R10).
 */
export function ValueEntry(props: Props) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState('');
  const text = draft.trim();
  const filled = text !== '';
  // A plain decimal only: Number() would also take '0x10', '1e2' or '.5', none of which a pilot
  // means as a heading. A minus sign only where the range has negative values.
  const plain = PLAIN_DECIMAL.test(text) && (props.min < 0 || !text.startsWith('-'));
  const parsed = Number(text);
  const valid = filled && plain && parsed >= props.min && parsed <= props.max;
  return (
    <View>
      <BodyText>
        {props.unit === undefined ? props.label : `${props.label} (${props.unit})`}
      </BodyText>
      <View style={styles.row}>
        <ThemedTextInput
          accessibilityLabel={props.label}
          value={draft}
          onChangeText={setDraft}
          keyboardType="numeric"
          style={styles.input}
        />
        <ControlButton
          label="Set"
          accessibilityLabel={`Set ${props.label}`}
          featureId={props.featureId}
          target={props.target}
          invalid={!valid}
          onPress={() => props.onSubmit(parsed)}
        />
      </View>
      {filled && !valid ? (
        <BodyText tone="danger">{`Enter a number from ${props.min} to ${props.max}.`}</BodyText>
      ) : null}
    </View>
  );
}
