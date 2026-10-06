import React, { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { type CompatibilitySnapshot, featureOf } from '@/application/compatibility';
import {
  FEATURE_CDU1_KEYS,
  FEATURE_CDU1_SCREEN,
  FEATURE_CDU2_KEYS,
  FEATURE_CDU2_SCREEN,
  cduScreenFeatureId,
} from '@/domain/aircraft/profiles/generic';
import { CDU_COLUMNS } from '@/domain/cdu/screen';
import { type CduKey, type CduUnit, LSK_LEFT, LSK_RIGHT } from '@/domain/cdu/keys';
import { missingKeysMessage } from '@/domain/cdu/messages';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { useCduUnit } from '@/features/panels/cdu/CduPreferenceProvider';
import { CduKeyButton, CduKeyboard, missingKeyCount } from '@/features/panels/cdu/CduKeyboard';
import { CduScreen } from '@/features/panels/cdu/CduScreen';
import { LSK_COLUMN, cduGeometry } from '@/features/panels/cdu/cdu-geometry';
import { useCduKeys } from '@/features/panels/cdu/useCduKeys';
import { useCduScreen } from '@/features/panels/cdu/useCduScreen';
import { AVIONICS_UNIT_PADDING, AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { useKeyEnabled } from '@/features/panels/primitives/KeyEnabledContext';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

export const CDU_PANEL: PanelDescriptor = {
  id: 'cdu',
  title: 'CDU',
  features: [FEATURE_CDU1_SCREEN, FEATURE_CDU1_KEYS, FEATURE_CDU2_SCREEN, FEATURE_CDU2_KEYS],
  supports: EVERYWHERE,
  // The glass stays pinned while only the keys scroll (spec §4.7): the panel scrolls its own parts.
  fillsFrame: true,
};

const UNITS: readonly CduUnit[] = [1, 2];

/** The glass's own border: its rows, and so the line-select keys, start this far down. */
const GLASS_BORDER = 1;

/** A blank glass row: drawn while waiting, so no half-arrived line is shown as if it were live. */
const BLANK_ROW = { text: ' '.repeat(CDU_COLUMNS), style: '' };

const makeStyles = (theme: Theme) => ({
  // Shares the bezel's label row: the unit keys, then the annunciators pushed to the right.
  header: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.touch.spacing,
  },
  unitKey: { marginVertical: 0 },
  annunciators: {
    flex: 1,
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  // An amber lamp legend on the bezel: SLOW and NOT LIVE.
  tag: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.caution,
    borderWidth: 1,
    borderColor: theme.avionics.caution,
    borderRadius: 3,
    paddingHorizontal: theme.spacing.xs,
    letterSpacing: 1,
  },
  glassRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  lskColumn: { width: LSK_COLUMN },
  // A line-select key spans its two rows exactly; the 48 dp face centres on them.
  lsk: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    marginVertical: 0,
    justifyContent: 'center' as const,
  },
  lskBar: { width: 16, height: 3, borderRadius: 1.5 },
  glass: { flex: 1, alignItems: 'center' as const },
  waiting: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  root: { flex: 1, gap: theme.touch.spacing },
  wide: { flex: 1, flexDirection: 'row' as const, gap: theme.touch.spacing },
  column: { flex: 1 },
  scroll: { flex: 1 },
});

function screenUnavailable(compatibility: CompatibilitySnapshot, unit: CduUnit): boolean {
  const feature = featureOf(compatibility, cduScreenFeatureId(unit));
  return feature === null || feature.status === 'unavailable';
}

/**
 * Spec §4.6: the remembered unit, unless this X-Plane does not publish its screen and does publish
 * the other's. Derived on every render and never saved, so the remembered choice survives a
 * session on an X-Plane that lacks it.
 */
export function shownCduUnit(preferred: CduUnit, compatibility: CompatibilitySnapshot): CduUnit {
  const other: CduUnit = preferred === 1 ? 2 : 1;
  return screenUnavailable(compatibility, preferred) && !screenUnavailable(compatibility, other)
    ? other
    : preferred;
}

const NO_FMS_DETAIL =
  "Add-on FMSs such as Zibo's or ToLiss's aren't supported yet. If the aircraft is powered down, the CDU appears when it powers up.";

function unavailableText(unit: CduUnit): string {
  return `This X-Plane doesn't publish the CDU ${unit} screen.`;
}

/** The short bar a line-select key carries instead of a legend, dimmed with the key. */
function LskBar() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const enabled = useKeyEnabled();
  return (
    <View
      style={[
        styles.lskBar,
        { backgroundColor: enabled ? theme.avionics.legend : theme.avionics.legendDim },
      ]}
    />
  );
}

/**
 * F-32. The default FMS's CDU: a bezel whose label row carries the CDU 1 / CDU 2 keys and the SLOW
 * and NOT LIVE tags, the mirrored glass between two columns of line-select keys, the message line
 * (only while there is something to say), and the function, alpha and numeric keys.
 * `useCduScreen` is called here, once, with whichever unit is shown: nothing that owns it is keyed
 * on the unit, so each unit's "seen" and rows 14–15 memory survives switching back and forth.
 *
 * The frame does not scroll this panel (`fillsFrame`). Narrow, the bezel is pinned and the keys
 * scroll in the rest of the height; wide (a window of 720 dp or more, landscape phones included),
 * the bezel and the keys are two columns that each scroll on their own (spec §4.7).
 */
export function CduPanel() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { snapshot } = usePanel();
  const window = useWindowDimensions();
  const [preferred, setPreferred] = useCduUnit();
  const unit = shownCduUnit(preferred, snapshot.compatibility);
  const screen = useCduScreen(unit);
  const keys = useCduKeys(unit);
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);

  const gap = theme.touch.spacing;
  const hasKeys = screen.state === 'live' || screen.state === 'waiting';
  // By the window, not the measured width: a landscape phone loses ~250 dp to the switcher rail and
  // insets, and a narrow layout at that width would grow a glass taller than the window.
  const wide = hasKeys && window.width >= TWO_COLUMN_MIN_WIDTH;
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const columnWidth = wide ? (contentWidth - gap) / 2 : contentWidth;
  // The unit's border (1 dp) and padding on each side, then a line-select column and a gap each.
  const innerWidth = columnWidth - 2 * (AVIONICS_UNIT_PADDING + 1);
  const glassWidth = Math.max(0, innerWidth - 2 * (LSK_COLUMN + gap));
  const geometry = cduGeometry(glassWidth);
  const { rowHeight } = geometry;
  // Alpha (5) and numeric (3) side by side need 8 keys and the 7 gaps between them.
  const sideBySide = columnWidth >= 8 * theme.touch.minTarget + 7 * gap;
  const waiting = screen.state === 'waiting';
  const rows = waiting ? screen.rows.map(() => BLANK_ROW) : screen.rows;
  const glassHeight = rows.length * rowHeight + 2 * GLASS_BORDER;
  const missing = missingKeysMessage(missingKeyCount(snapshot, unit));

  const lskColumn = (side: readonly CduKey[]) => (
    <View style={[styles.lskColumn, { height: glassHeight }]}>
      {side.map((entry, index) => (
        <CduKeyButton
          key={entry.id}
          entry={entry}
          unit={unit}
          press={keys.press}
          waiting={waiting}
          style={[
            styles.lsk,
            { top: GLASS_BORDER + rowHeight * (2 * (index + 1) - 1), height: 2 * rowHeight },
          ]}
        >
          <LskBar />
        </CduKeyButton>
      ))}
    </View>
  );

  const header = (
    <View style={styles.header}>
      {UNITS.map((n) => (
        <ControlButton
          key={n}
          label={`CDU ${n}`}
          accessibilityLabel={
            screenUnavailable(snapshot.compatibility, n)
              ? `CDU ${n}. ${unavailableText(n)}`
              : undefined
          }
          featureId={cduScreenFeatureId(n)}
          target={`cdu-select-${n}`}
          quiet
          compact
          selected={unit === n}
          onPress={() => setPreferred(n)}
          style={styles.unitKey}
        />
      ))}
      <View style={styles.annunciators}>
        {keys.slow ? (
          <Text style={styles.tag} accessibilityLabel="Link slow">
            SLOW
          </Text>
        ) : null}
        {screen.stale ? <Text style={styles.tag}>NOT LIVE</Text> : null}
      </View>
    </View>
  );

  let body: React.ReactNode;
  switch (screen.state) {
    case 'unavailable':
      body = <BodyText testID="cdu-unavailable">{unavailableText(unit)}</BodyText>;
      break;
    case 'noFms':
      body = (
        <View testID="cdu-no-fms">
          <BodyText>{`${screen.aircraftName} isn't showing anything on X-Plane's built-in CDU.`}</BodyText>
          <BodyText muted>{NO_FMS_DETAIL}</BodyText>
        </View>
      );
      break;
    case 'waiting':
    case 'live':
      body = (
        <>
          <View style={styles.glassRow}>
            {lskColumn(LSK_LEFT)}
            <View style={styles.glass}>
              <CduScreen rows={rows} geometry={geometry} stale={screen.stale} />
              {waiting ? (
                <View style={styles.waiting} pointerEvents="none">
                  <Text
                    style={[
                      numeric(theme),
                      { fontSize: geometry.smallFontSize, color: theme.cdu.white },
                    ]}
                  >
                    Waiting for the CDU screen…
                  </Text>
                </View>
              ) : null}
            </View>
            {lskColumn(LSK_RIGHT)}
          </View>
          {/* Spec §4.5's message line takes no height until there is a message: on a phone the
              pinned bezel cannot spare an empty line. */}
          {keys.message === null ? null : (
            <BodyText testID="cdu-message" accessibilityLiveRegion="polite">
              {keys.message}
            </BodyText>
          )}
          {missing === null ? null : (
            <BodyText muted testID="cdu-missing">
              {missing}
            </BodyText>
          )}
        </>
      );
      break;
  }

  const cdu = (
    <AvionicsUnit label="CDU" labelAccessory={header} testID="cdu-unit">
      {body}
    </AvionicsUnit>
  );

  if (!hasKeys) {
    return (
      <View testID="cdu-panel" onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}>
        {cdu}
      </View>
    );
  }

  const keyboard = (
    <CduKeyboard
      unit={unit}
      press={keys.press}
      execLit={screen.execLit}
      waiting={waiting}
      sideBySide={sideBySide}
    />
  );

  if (wide) {
    return (
      <View
        testID="cdu-panel"
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
        style={styles.wide}
      >
        <View testID="cdu-wide-left" style={styles.column}>
          <ScrollView testID="cdu-unit-scroll" style={styles.scroll}>
            {cdu}
          </ScrollView>
        </View>
        <View testID="cdu-wide-right" style={styles.column}>
          <ScrollView testID="cdu-keys-scroll" style={styles.scroll}>
            {keyboard}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Narrow: the CDU stays put and only the keys scroll beneath it, in whatever height the frame
  // leaves, so the scratchpad stays in view while typing (spec §4.7).
  return (
    <View
      testID="cdu-panel"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={styles.root}
    >
      {cdu}
      <ScrollView testID="cdu-keys-scroll" style={styles.scroll}>
        {keyboard}
      </ScrollView>
    </View>
  );
}
