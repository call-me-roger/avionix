import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { OnBezelContext } from '@/theme/surface-context';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

/** The bezel's inner padding: a panel that sizes its contents to the unit's width subtracts it. */
export const AVIONICS_UNIT_PADDING = 12;

const makeStyles = (theme: Theme) => ({
  unit: {
    backgroundColor: theme.avionics.bezel,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 12,
    padding: AVIONICS_UNIT_PADDING,
    gap: theme.spacing.sm,
  },
  labelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
  /**
   * Drawn on the label's own row, after it (the CDU's unit keys and annunciators), so a unit whose
   * height is precious spends no separate row on them.
   */
  labelAccessory?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * The hardware bezel every panel surface sits on (spec section 2). Replaces the bordered rows and
 * sections that radios, transponder and autopilot used before this refinement. Provides the
 * on-bezel context so `BodyText` inside it switches to the avionics palette automatically.
 */
export function AvionicsUnit({ label, labelAccessory, testID, style, children }: Props) {
  const styles = useThemedStyles(makeStyles);
  const labelText =
    label === undefined ? null : (
      <Text style={styles.label} accessibilityRole="header">
        {label}
      </Text>
    );
  return (
    <View style={[styles.unit, style]} testID={testID}>
      {labelAccessory === undefined ? (
        labelText
      ) : (
        <View style={styles.labelRow}>
          {labelText}
          {labelAccessory}
        </View>
      )}
      <OnBezelContext.Provider value={true}>{children}</OnBezelContext.Provider>
    </View>
  );
}
