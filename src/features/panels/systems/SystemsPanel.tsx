import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { PanelKey } from '@/features/panels/primitives/PanelKey';
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
  pageKey: { flex: 1 },
  wideRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  wideColumn: { flex: 1, gap: theme.touch.spacing },
});

/**
 * F-24's Systems panel (spec §4.7–§4.8): a phone shows one page at a time behind a row of page
 * keys (the last one remembered under `avionix.systems`, FLIGHT on first use); a window 720 dp or
 * wider shows two columns instead, scrolling together in the frame's one ScrollView, with no page
 * keys. One `useReadBack` is owned here and passed to whichever sections are mounted, so a
 * read-back failure survives switching pages, and a held control's lease is released (its unit
 * unmounts) when the page changes under it.
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
          <PanelKey
            key={candidate.id}
            testID={`systems-page-${candidate.id}`}
            legend={candidate.legend}
            role="tab"
            selected={candidate.id === page}
            lit={candidate.id === page}
            onPress={() => setPage(candidate.id)}
            style={styles.pageKey}
          />
        ))}
      </View>
      <Section readBack={readBack} />
    </View>
  );
}
