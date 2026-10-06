import React, { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { type CompatibilitySnapshot, featureOf } from '@/application/compatibility';
import {
  FEATURE_CDU1_KEYS,
  FEATURE_CDU1_SCREEN,
  FEATURE_CDU2_KEYS,
  FEATURE_CDU2_SCREEN,
  cduKeysFeatureId,
  cduScreenFeatureId,
} from '@/domain/aircraft/profiles/generic';
import { CDU_COLUMNS } from '@/domain/cdu/screen';
import { type CduKey, type CduUnit, LSK_LEFT, LSK_RIGHT, cduCommand } from '@/domain/cdu/keys';
import { missingKeysMessage } from '@/domain/cdu/messages';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { useCduUnit } from '@/features/panels/cdu/CduPreferenceProvider';
import {
  CduKeyboard,
  isKeyMissing,
  keyLabel,
  missingKeyCount,
} from '@/features/panels/cdu/CduKeyboard';
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
};

const UNITS: readonly CduUnit[] = [1, 2];

/**
 * What a phone's shell takes around a panel in portrait — the link status bar under the system
 * status area, the panel title, the frame's padding and the switcher bar over the home indicator —
 * so the narrow layout can bound the key area to what is left under the pinned CDU. An estimate:
 * the panel cannot see the frame's viewport, and a device check confirms it (spec §4.7).
 */
const NARROW_SHELL_ESTIMATE = 260;

/** A blank glass row: drawn while waiting, so no half-arrived line is shown as if it were live. */
const BLANK_ROW = { text: ' '.repeat(CDU_COLUMNS), style: '' };

const makeStyles = (theme: Theme) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.touch.spacing,
  },
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
  narrow: { gap: theme.touch.spacing },
  wide: {
    flexDirection: 'row' as const,
    gap: theme.touch.spacing,
    alignItems: 'flex-start' as const,
  },
  column: { flex: 1 },
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
 * F-32. The default FMS's CDU: a bezel with the CDU 1 / CDU 2 keys, the mirrored glass between two
 * columns of line-select keys and one message line, and the function, alpha and numeric keys.
 * `useCduScreen` is called here, once, with whichever unit is shown: nothing that owns it is keyed
 * on the unit, so each unit's "seen" and rows 14–15 memory survives switching back and forth.
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
  const [unitHeight, setUnitHeight] = useState<number | null>(null);

  const gap = theme.touch.spacing;
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const hasKeys = screen.state === 'live' || screen.state === 'waiting';
  const wide = hasKeys && contentWidth >= TWO_COLUMN_MIN_WIDTH;
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
  // The glass's own 1 dp border, above and below its rows.
  const glassHeight = rows.length * rowHeight + 2;
  const missing = missingKeysMessage(missingKeyCount(snapshot, unit));

  const lskColumn = (side: readonly CduKey[]) => (
    <View style={[styles.lskColumn, { height: glassHeight }]}>
      {side.map((entry, index) => {
        const absent = isKeyMissing(snapshot, unit, entry.id);
        return (
          <ControlButton
            key={entry.id}
            label={entry.name}
            accessibilityLabel={keyLabel(entry.spoken, absent)}
            featureId={cduKeysFeatureId(unit)}
            target={cduCommand(unit, entry.id)}
            quiet
            repeatable
            invalid={absent || waiting}
            onPress={() => keys.press(entry.id)}
            style={[styles.lsk, { top: rowHeight * (2 * (index + 1) - 1), height: 2 * rowHeight }]}
          >
            <LskBar />
          </ControlButton>
        );
      })}
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
          selected={unit === n}
          onPress={() => setPreferred(n)}
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
          <BodyText testID="cdu-message" accessibilityLiveRegion="polite">
            {keys.message ?? ''}
          </BodyText>
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
    <View onLayout={(event) => setUnitHeight(event.nativeEvent.layout.height)}>
      <AvionicsUnit label="CDU" testID="cdu-unit">
        {header}
        {body}
      </AvionicsUnit>
    </View>
  );

  const keyboard = hasKeys ? (
    <CduKeyboard
      unit={unit}
      press={keys.press}
      execLit={screen.execLit}
      waiting={waiting}
      sideBySide={sideBySide}
    />
  ) : null;

  if (wide) {
    return (
      <View
        testID="cdu-panel"
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
        style={styles.wide}
      >
        <View testID="cdu-wide-left" style={styles.column}>
          {cdu}
        </View>
        <View testID="cdu-wide-right" style={styles.column}>
          <ScrollView testID="cdu-keys-scroll" nestedScrollEnabled>
            {keyboard}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Narrow: the CDU stays put and only the keys scroll beneath it, so the scratchpad stays in view
  // while typing (spec §4.7). Two key rows at least, however short the window.
  const keyRow = theme.touch.minTarget + theme.touch.spacing;
  const pinned = unitHeight ?? glassHeight + 4 * keyRow;
  const keysHeight = Math.max(2 * keyRow, window.height - pinned - NARROW_SHELL_ESTIMATE);
  return (
    <View
      testID="cdu-panel"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={styles.narrow}
    >
      {cdu}
      {keyboard === null ? null : (
        <ScrollView testID="cdu-keys-scroll" nestedScrollEnabled style={{ maxHeight: keysHeight }}>
          {keyboard}
        </ScrollView>
      )}
    </View>
  );
}
