import React from 'react';

import { RadioChips } from '@/theme/RadioChips';
import { useThemePreference } from '@/theme/theme-context';
import { THEME_PREFERENCES, type ThemePreference } from '@/theme/theme-preference';

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'auto-night': 'System (night)',
  light: 'Light',
  dark: 'Dark',
  night: 'Night',
};

const OPTIONS = THEME_PREFERENCES.map((value) => ({
  value,
  label: LABELS[value],
  accessibilityLabel: `Theme ${LABELS[value]}`,
}));

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  return <RadioChips options={OPTIONS} selected={preference} onSelect={setPreference} />;
}
