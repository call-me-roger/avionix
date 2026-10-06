import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import {
  FEATURE_FLIGHT_INSTRUMENTS,
  FEATURE_HEADING_CONTROL,
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_NAV_AIDS,
  FEATURE_NAV_COURSE,
  FEATURE_NAV_DEVIATION,
  FEATURE_NAV_GLIDESLOPE,
  FEATURE_NAV_SOURCE,
} from '@/domain/aircraft/profiles/generic';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { Hsi } from '@/features/panels/navigation/Hsi';
import { NavControls } from '@/features/panels/navigation/NavControls';
import { useCourseEntry } from '@/features/panels/navigation/useCourseEntry';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { useTheme } from '@/theme/theme-context';

/**
 * The navaid identifier shown on the HSI (`useNavValues`) comes from NAV1's or NAV2's own
 * identifier DataRef, bound under those radio features, not under any of the five new ones: both
 * must be demanded here too, or the identifier never arrives (binding ruling, spec §5).
 */
export const NAVIGATION_PANEL: PanelDescriptor = {
  id: 'navigation',
  title: 'Navigation',
  features: [
    FEATURE_NAV_DEVIATION,
    FEATURE_NAV_GLIDESLOPE,
    FEATURE_NAV_SOURCE,
    FEATURE_NAV_COURSE,
    FEATURE_NAV_AIDS,
    FEATURE_NAV1,
    FEATURE_NAV2,
    FEATURE_FLIGHT_INSTRUMENTS,
    FEATURE_HEADING_CONTROL,
  ],
  supports: EVERYWHERE,
};

/**
 * F-30. Keyed by the aircraft, so a change of aircraft drops a half-typed course and any read-back
 * sentence instead of carrying them onto a different NAV stack, exactly as Autopilot and Radios do.
 */
export function NavigationPanel() {
  const { snapshot } = usePanel();
  const { icaoType, description, tailNumber } = snapshot.compatibility.identity;
  return <NavigationContent key={`${icaoType}|${description}|${tailNumber}`} />;
}

function NavigationContent() {
  const theme = useTheme();
  const readBack = useReadBack();
  const entry = useCourseEntry();
  const window = useWindowDimensions();
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const wide = contentWidth >= TWO_COLUMN_MIN_WIDTH;
  const gap = theme.touch.spacing;
  // The same height rule `pfdWidth` applies to the PFD (spec §5): 0.6 of the window in portrait.
  const heightCap = Math.round(window.height * 0.6);
  const hsiSize = wide
    ? Math.max(0, Math.min(Math.round((contentWidth - gap) / 2), heightCap))
    : Math.max(0, Math.min(contentWidth, heightCap));

  return (
    <View
      testID="nav-columns"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={{
        flexDirection: wide ? 'row' : 'column',
        gap,
        alignItems: wide ? 'flex-start' : 'center',
      }}
    >
      <View
        testID="nav-wide-left"
        style={wide ? { flex: 1, alignItems: 'center' } : { alignItems: 'center' }}
      >
        <Hsi size={hsiSize} />
      </View>
      <View testID="nav-wide-right" style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
        <NavControls readBack={readBack} entry={entry} />
      </View>
    </View>
  );
}
