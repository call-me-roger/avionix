import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { OnBezelContext } from '@/theme/surface-context';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  unit: {
    backgroundColor: theme.avionics.bezel,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 12,
    padding: 12,
    gap: theme.spacing.sm,
  },
  label: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 1,
  },
});

interface Props {
  /** Engraved at the top left, capitals as given (e.g. "COM1", "XPDR", "AUTOPILOT"). */
  label?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * The hardware bezel every panel surface sits on (spec section 2). Replaces the bordered rows and
 * sections that radios, transponder and autopilot used before this refinement. Provides the
 * on-bezel context so `BodyText` inside it switches to the avionics palette automatically.
 */
export function AvionicsUnit({ label, testID, style, children }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.unit, style]} testID={testID}>
      {label === undefined ? null : (
        <Text style={styles.label} accessibilityRole="header">
          {label}
        </Text>
      )}
      <OnBezelContext.Provider value={true}>{children}</OnBezelContext.Provider>
    </View>
  );
}
