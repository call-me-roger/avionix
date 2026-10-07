import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ElectricalSection } from '@/features/panels/engines/ElectricalSection';
import { ENGINES_PAGES, type EnginesPage, WIDE_MIN_WIDTH } from '@/features/panels/engines/engines';
import { EnginesSection } from '@/features/panels/engines/EnginesSection';
import { useEnginesPage } from '@/features/panels/engines/EnginesPreferenceProvider';
import { FuelSection } from '@/features/panels/engines/FuelSection';
import { EnginesModelProvider } from '@/features/panels/engines/useEnginesModel';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { PanelKey } from '@/features/panels/primitives/PanelKey';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export { ENGINES_PANEL } from '@/features/panels/engines/engines';

const SECTIONS: Record<EnginesPage, React.ComponentType> = {
  engines: EnginesSection,
  fuel: FuelSection,
  elec: ElectricalSection,
};

const makeStyles = (theme: Theme) => ({
  root: { gap: theme.touch.spacing },
  pageRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  pageKey: { flex: 1 },
  wideRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  wideColumn: { flex: 1, gap: theme.touch.spacing },
});

/**
 * F-12's Engines panel (spec §4.10–§4.11): read-only. A phone shows one page at a time behind
 * ENGINES, FUEL and ELEC keys (remembered under `avionix.engines`, ENGINES on first use); a
 * window 720 dp or wider shows ENGINES across the top and FUEL and ELEC side by side below. With
 * no flight loaded it draws nothing: the frame's notice says why (R5). The ENGINES model is derived
 * once here for whichever sections are shown.
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
      <EnginesModelProvider>
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
      </EnginesModelProvider>
    );
  }

  const Section = SECTIONS[page];
  return (
    <View style={styles.root}>
      <View style={styles.pageRow}>
        {ENGINES_PAGES.map((candidate) => (
          <PanelKey
            key={candidate.id}
            testID={`engines-page-${candidate.id}`}
            legend={candidate.legend}
            role="tab"
            selected={candidate.id === page}
            lit={candidate.id === page}
            onPress={() => setPage(candidate.id)}
            style={styles.pageKey}
          />
        ))}
      </View>
      <EnginesModelProvider>
        <Section />
      </EnginesModelProvider>
    </View>
  );
}
