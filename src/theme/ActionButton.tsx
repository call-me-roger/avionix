import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export type ActionButtonVariant = 'primary' | 'secondary' | 'destructive';

const makeStyles = (theme: Theme) => ({
  base: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    borderRadius: 10,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { borderWidth: 1, borderColor: theme.colors.border },
  destructive: { borderWidth: 1, borderColor: theme.colors.danger },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  textPrimary: { color: theme.colors.onPrimary, fontWeight: 'bold' as const },
  textSecondary: { color: theme.colors.text },
  textDestructive: { color: theme.colors.danger },
});

const TEXT_STYLE_KEY: Record<
  ActionButtonVariant,
  'textPrimary' | 'textSecondary' | 'textDestructive'
> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  destructive: 'textDestructive',
};

/**
 * The one button every screen uses outside a panel (R-01): a native-feeling `Pressable` in place
 * of the platform `Button`, so colour, shape and the busy/disabled states are consistent and
 * themed. Its accessible name is `accessibilityLabel ?? title` with role `button`, matching
 * `Button`'s own contract, so existing `getByRole('button', { name })` and `getByText(title)`
 * queries keep working.
 */
export function ActionButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const textStyle = styles[TEXT_STYLE_KEY[variant]];
  const inactive = disabled || busy;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {busy ? <ActivityIndicator testID="action-button-busy" color={textStyle.color} /> : null}
      <Text style={textStyle}>{title}</Text>
    </Pressable>
  );
}
