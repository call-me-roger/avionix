import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { ElectricalSection } from '@/features/panels/engines/ElectricalSection';
import { ENGINES_PAGES, type EnginesPage, WIDE_MIN_WIDTH } from '@/features/panels/engines/engines';
import { EnginesSection } from '@/features/panels/engines/EnginesSection';
import { useEnginesPage } from '@/features/panels/engines/EnginesPreferenceProvider';
import { FuelSection } from '@/features/panels/engines/FuelSection';
import { LightBar } from '@/features/panels/primitives/LightBar';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

export { ENGINES_PANEL } from '@/features/panels/engines/engines';

const SECTIONS: Record<EnginesPage, React.ComponentType> = {
  engines: EnginesSection,
  fuel: FuelSection,
  elec: ElectricalSection,
};

const makeStyles = (theme: Theme) => ({
  root: { gap: theme.touch.spacing },
  pageRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  pageKey: {
    flex: 1,
    backgroundColor: theme.avionics.keyFace,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 6,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
  wideRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  wideColumn: { flex: 1, gap: theme.touch.spacing },
});

function EnginesPageKey({
  page,
  selected,
  onPress,
}: {
  page: (typeof ENGINES_PAGES)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID={`engines-page-${page.id}`}
      accessibilityRole="tab"
      accessibilityLabel={page.legend}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.pageKey}
    >
      <LightBar state={selected ? 'engaged' : 'off'} />
      <Text style={styles.legend}>{page.legend}</Text>
    </Pressable>
  );
}

/**
 * F-12's Engines panel (spec §4.10–§4.11): read-only. A phone shows one page at a time behind
 * ENGINES, FUEL and ELEC keys (remembered under `avionix.engines`, ENGINES on first use); a
 * window 720 dp or wider shows ENGINES across the top and FUEL and ELEC side by side below. With
 * no flight loaded it draws nothing: the frame's notice says why (R5).
 */
export function EnginesPanel() {
  const styles = useThemedStyles(makeStyles);
  const window = useWindowDimensions();
  const { snapshot } = usePanel();
  const [page, setPage] = useEnginesPage();

  if (snapshot.state === 'connected' && snapshot.health.activity === 'noFlight') {
    return null;
  }

  if (window.width >= WIDE_MIN_WIDTH) {
    return (
      <View testID="engines-wide" style={styles.root}>
        <EnginesSection />
        <View style={styles.wideRow}>
          <View style={styles.wideColumn}>
            <FuelSection />
          </View>
          <View style={styles.wideColumn}>
            <ElectricalSection />
          </View>
        </View>
      </View>
    );
  }

  const Section = SECTIONS[page];
  return (
    <View style={styles.root}>
      <View style={styles.pageRow}>
        {ENGINES_PAGES.map((candidate) => (
          <EnginesPageKey
            key={candidate.id}
            page={candidate}
            selected={candidate.id === page}
            onPress={() => setPage(candidate.id)}
          />
        ))}
      </View>
      <Section />
    </View>
  );
}
