import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useThemePreference, useThemedStyles } from '@/theme/theme-context';
import { THEME_PREFERENCES, type ThemePreference } from '@/theme/theme-preference';
import type { Theme } from '@/theme/tokens';

const LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  chipTextSelected: { color: theme.colors.onPrimary, fontWeight: 'bold' as const },
});

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {THEME_PREFERENCES.map((option) => {
        const selected = option === preference;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={`Theme ${LABELS[option]}`}
            accessibilityState={{ checked: selected, selected }}
            hitSlop={8}
            onPress={() => setPreference(option)}
            style={[styles.chip, selected ? styles.chipSelected : null]}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
              {LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
