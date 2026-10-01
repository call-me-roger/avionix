import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { type EntryKind, entryDigits } from '@/domain/radios/entry';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** Taller than the 48 dp minimum: the radio-stack complaint in the research is keys too small to hit. */
export const KEY_HEIGHT = 56;

const makeStyles = (theme: Theme) => ({
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
  key: {
    flexBasis: '30%' as const,
    flexGrow: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
  },
});

interface Props {
  kind: EntryKind;
  onDigit: (digit: number) => void;
  onErase: () => void;
  onClear: () => void;
}

/** Digits in phone order, then delete, 0 and clear. A squawk keypad has no 8 or 9 at all. */
export function Keypad({ kind, onDigit, onErase, onClear }: Props) {
  const styles = useThemedStyles(makeStyles);
  const digits = entryDigits(kind);
  const zero = digits[digits.length - 1];
  const key = (label: string, accessibilityLabel: string, onPress: () => void) => (
    <Pressable
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.key}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.grid}>
      {digits.slice(0, -1).map((digit) => key(String(digit), String(digit), () => onDigit(digit)))}
      {key('⌫', 'Delete', onErase)}
      {zero === undefined ? null : key(String(zero), String(zero), () => onDigit(zero))}
      {key('Clear', 'Clear', onClear)}
    </View>
  );
}
