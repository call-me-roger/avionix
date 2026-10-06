import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Orientation } from '@/domain/panels/panel';
import { PanelIcon } from '@/features/shell/PanelIcon';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  bottom: { borderTopWidth: 1, borderColor: theme.colors.border },
  rail: { borderRightWidth: 1, borderColor: theme.colors.border, maxWidth: 160 },
  bar: { backgroundColor: theme.colors.surface },
  items: { padding: theme.touch.spacing / 2, gap: theme.touch.spacing },
  item: {
    position: 'relative' as const,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.xs,
  },
  itemColumn: { flexDirection: 'column' as const },
  itemRow: { flexDirection: 'row' as const },
  // The selected indicator sits on the edge facing the content: the top in the portrait bottom
  // bar, the right edge in the landscape rail. The full primary fill is gone (R-01); the bar, icon and
  // label are drawn in `accent`, which stays readable on the surface in every mode.
  indicatorTop: {
    position: 'absolute' as const,
    top: 0,
    left: theme.spacing.sm,
    right: theme.spacing.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  indicatorRight: {
    position: 'absolute' as const,
    right: 0,
    top: theme.spacing.xs,
    bottom: theme.spacing.xs,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  label: { color: theme.colors.textMuted, fontSize: theme.typography.captionSize + 1 },
  labelSelected: { color: theme.colors.accent, fontWeight: 'bold' as const },
});

/**
 * One touch to any panel (the user story): a bottom bar in portrait, a side rail in landscape,
 * scrolling if the pilot keeps more panels than fit.
 */
export function PanelSwitcher({
  items,
  route,
  orientation,
  safeArea,
  onSelect,
}: {
  items: readonly { id: string; title: string }[];
  route: string;
  orientation: Orientation;
  /** The system-area inset on the edge the bar sits against, kept as padding on its surface. */
  safeArea?: { bottom?: number; left?: number };
  onSelect: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const portrait = orientation === 'portrait';
  return (
    <View
      testID="panel-switcher"
      accessibilityRole="tablist"
      style={[
        styles.bar,
        portrait ? styles.bottom : styles.rail,
        { paddingBottom: safeArea?.bottom ?? 0, paddingLeft: safeArea?.left ?? 0 },
      ]}
    >
      <ScrollView
        horizontal={portrait}
        contentContainerStyle={styles.items}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const selected = item.id === route;
          const tint = selected ? theme.colors.accent : theme.colors.textMuted;
          return (
            <Pressable
              key={item.id}
              testID={`switch-${item.id}`}
              accessibilityRole="tab"
              accessibilityLabel={item.title}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.id)}
              style={[styles.item, portrait ? styles.itemColumn : styles.itemRow]}
            >
              {selected ? (
                <View style={portrait ? styles.indicatorTop : styles.indicatorRight} />
              ) : null}
              <PanelIcon id={item.id} color={tint} />
              <Text style={[styles.label, selected ? styles.labelSelected : null]}>
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
