import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/features/haptics/HapticsProvider';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

/** Taller than the 48 dp minimum: the radio-stack complaint in the research is keys too small to hit. */
export const KEY_HEIGHT = 56;

const makeStyles = (theme: Theme) => ({
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
  key: {
    flexBasis: '30%' as const,
    // No flexGrow: a lone key on its own row (Clear, under a 0–7 squawk keypad) must stay one
    // column wide, never stretch to fill the row (M4).
    flexGrow: 0,
    minHeight: KEY_HEIGHT,
    minWidth: theme.touch.minTarget,
    backgroundColor: theme.avionics.keyFace,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Pressed is translated down 1 dp, a hardware key's own travel.
  pressed: { backgroundColor: theme.avionics.keyFacePressed, transform: [{ translateY: 1 }] },
  label: { color: theme.avionics.legend },
  digit: { ...numeric(theme, true), fontSize: theme.typography.displaySize },
  // Word and symbol keys are legends, not values: at displaySize "Clear" overflows a phone key.
  word: { ...avionicsText(theme, true), fontSize: theme.typography.legendSize },
});

interface Props {
  /** The digit keys in keypad order; the last is shown between Delete and Clear. */
  digits: readonly number[];
  onDigit: (digit: number) => void;
  onErase: () => void;
  onClear: () => void;
  /** A sign key (vertical speed): shown after Clear when given. */
  onSign?: () => void;
}

/** Digits in phone order, then delete, the last digit (0) and clear; a sign key when asked for. */
export function Keypad({ digits, onDigit, onErase, onClear, onSign }: Props) {
  const styles = useThemedStyles(makeStyles);
  const haptics = useHaptics();
  const zero = digits[digits.length - 1];
  const key = (
    label: string,
    accessibilityLabel: string,
    onPress: () => void,
    kind: 'digit' | 'word' = 'digit',
  ) => (
    <Pressable
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptics.press();
        onPress();
      }}
      style={({ pressed }) => [styles.key, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.label, styles[kind]]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.grid}>
      {digits.slice(0, -1).map((digit) => key(String(digit), String(digit), () => onDigit(digit)))}
      {key('⌫', 'Delete', onErase, 'word')}
      {zero === undefined ? null : key(String(zero), String(zero), () => onDigit(zero))}
      {key('Clear', 'Clear', onClear, 'word')}
      {onSign === undefined ? null : key('±', 'Change sign', onSign, 'word')}
    </View>
  );
}
