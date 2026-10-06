import React from 'react';
import { Text, View } from 'react-native';

import { numeric } from '@/theme/typography';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const BOX_WIDTH = 44;
const BOX_HEIGHT = 56;

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.sm },
  box: {
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  boxNext: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  digit: {
    ...numeric(theme, true),
    fontSize: theme.typography.displaySize,
    color: theme.colors.text,
  },
});

/**
 * The visual half of the pairing code field (R-01 Setup): `length` boxes, each showing one typed
 * digit, drawn over the real `TextInput` that owns focus and the keyboard. The digits are never
 * logged — they are read back only from `code`, which the caller already holds as plain on-screen
 * state (see `PairingFields`).
 */
export function PairingCodeBoxes({ code, length }: { code: string; length: number }) {
  const styles = useThemedStyles(makeStyles);
  const boxes = Array.from({ length }, (_, index) => index);

  return (
    <View style={styles.row}>
      {boxes.map((index) => {
        const isNext = index === code.length;
        return (
          <View key={index} style={[styles.box, isNext ? styles.boxNext : null]}>
            <Text style={styles.digit}>{code[index] ?? ''}</Text>
          </View>
        );
      })}
    </View>
  );
}
