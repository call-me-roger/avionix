import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { LightBar } from '@/features/panels/primitives/LightBar';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import {
  EngineSection,
  FlightSection,
  IceSection,
  LightsSection,
} from '@/features/panels/systems/sections';
import { SYSTEMS_PAGES, WIDE_MIN_WIDTH, type SystemsPage } from '@/features/panels/systems/systems';
import { useSystemsPage } from '@/features/panels/systems/SystemsPreferenceProvider';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

export { SYSTEMS_PANEL } from '@/features/panels/systems/systems';

const SECTIONS: Record<SystemsPage, typeof EngineSection> = {
  engine: EngineSection,
  lights: LightsSection,
  flight: FlightSection,
  ice: IceSection,
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

/** One phone page key (spec §4.7): the R-01 key face, a light bar for the selected page. */
function SystemsPageKey({
  page,
  selected,
  onPress,
}: {
  page: (typeof SYSTEMS_PAGES)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID={`systems-page-${page.id}`}
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
 * F-24's Systems panel (spec §4.7–§4.8): a phone shows one page at a time behind a row of page
 * keys (the last one remembered under `avionix.systems`, FLIGHT on first use); a window 720 dp or
 * wider shows two columns instead, scrolling together in the frame's one ScrollView, with no page
 * keys. One `useReadBack` is owned here
 * and passed to whichever sections are mounted, so a read-back failure survives switching pages,
 * and a held control's lease is released (its unit unmounts) when the page changes under it.
 */
export function SystemsPanel() {
  const styles = useThemedStyles(makeStyles);
  const window = useWindowDimensions();
  const readBack = useReadBack();
  const [page, setPage] = useSystemsPage();
  const wide = window.width >= WIDE_MIN_WIDTH;

  if (wide) {
    return (
      <View style={styles.wideRow}>
        <View testID="systems-wide-left" style={styles.wideColumn}>
          <EngineSection readBack={readBack} />
          <LightsSection readBack={readBack} />
        </View>
        <View testID="systems-wide-right" style={styles.wideColumn}>
          <FlightSection readBack={readBack} />
          <IceSection readBack={readBack} />
        </View>
      </View>
    );
  }

  const Section = SECTIONS[page];
  return (
    <View style={styles.root}>
      <View style={styles.pageRow}>
        {SYSTEMS_PAGES.map((candidate) => (
          <SystemsPageKey
            key={candidate.id}
            page={candidate}
            selected={candidate.id === page}
            onPress={() => setPage(candidate.id)}
          />
        ))}
      </View>
      <Section readBack={readBack} />
    </View>
  );
}
