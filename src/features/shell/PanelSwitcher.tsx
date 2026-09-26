import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Orientation } from '@/domain/panels/panel';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  bottom: { borderTopWidth: 1, borderColor: theme.colors.border },
  rail: { borderRightWidth: 1, borderColor: theme.colors.border, maxWidth: 160 },
  bar: { backgroundColor: theme.colors.surface },
  items: { padding: theme.touch.spacing / 2, gap: theme.touch.spacing },
  item: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  selected: { backgroundColor: theme.colors.primary },
  label: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  labelSelected: { color: theme.colors.onPrimary, fontWeight: 'bold' as const },
});

/**
 * One touch to any panel (the user story): a bottom bar in portrait, a side rail in landscape,
 * scrolling if the pilot keeps more panels than fit.
 */
export function PanelSwitcher({
  items,
  route,
  orientation,
  onSelect,
}: {
  items: readonly { id: string; title: string }[];
  route: string;
  orientation: Orientation;
  onSelect: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const portrait = orientation === 'portrait';
  return (
    <View accessibilityRole="tablist" style={[styles.bar, portrait ? styles.bottom : styles.rail]}>
      <ScrollView
        horizontal={portrait}
        contentContainerStyle={styles.items}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const selected = item.id === route;
          return (
            <Pressable
              key={item.id}
              testID={`switch-${item.id}`}
              accessibilityRole="tab"
              accessibilityLabel={item.title}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.id)}
              style={[styles.item, selected ? styles.selected : null]}
            >
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
