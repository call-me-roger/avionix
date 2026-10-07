import React from 'react';
import { Text, View } from 'react-native';

import { GAUGES, type GaugeId } from '@/domain/engines/catalogue';
import type { EnginesModel, GaugeReading } from '@/domain/engines/engine-page';
import { type Peaks, leanDelta } from '@/domain/engines/lean';
import { MAX_DIAL_SIZE } from '@/features/panels/engines/engines';
import { GaugeBar } from '@/features/panels/engines/GaugeBar';
import { GaugeDial } from '@/features/panels/engines/GaugeDial';
import { toneColour } from '@/features/panels/engines/tone';
import { useUnits } from '@/features/units/UnitsProvider';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

const GAP = 8;
const LABEL_WIDTH = 72;
const MIN_DIAL = 64;

const makeStyles = (theme: Theme) => ({
  root: { gap: GAP },
  dials: { flexDirection: 'row' as const, justifyContent: 'space-around' as const, gap: GAP },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: GAP },
  label: {
    ...avionicsText(theme, true),
    width: LABEL_WIDTH,
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 0.5,
  },
  cell: { flex: 1, gap: 2 },
  value: { ...numeric(theme, true), fontSize: 18 },
});

function GaugeCell({
  reading,
  id,
  engine,
  stale,
  peak,
}: {
  reading: GaugeReading | undefined;
  id: GaugeId;
  engine: number;
  stale: boolean;
  peak: number | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (reading === undefined) {
    return (
      <View
        style={styles.cell}
        accessible
        accessibilityLabel={`${GAUGES[id].spoken}, not used on engine ${engine}`}
      />
    );
  }
  return (
    <View
      testID={`engine-cell-${id}-${engine}`}
      style={styles.cell}
      accessible
      accessibilityLabel={reading.spoken}
    >
      <Text style={[styles.value, { color: toneColour(theme, reading.tone, stale) }]}>
        {reading.text}
      </Text>
      {reading.scale === null ? null : (
        <GaugeBar
          scale={reading.scale}
          bands={reading.bands}
          value={reading.value}
          tone={reading.tone}
          stale={stale}
          peak={peak}
        />
      )}
    </View>
  );
}

/** ΔPEAK under EGT while lean assist is on (spec §4.6). */
function LeanRow({
  model,
  peaks,
  unitLabel,
  stale,
}: {
  model: EnginesModel;
  peaks: Peaks;
  unitLabel: string;
  stale: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { units } = useUnits();
  return (
    <View testID="engine-row-lean" style={styles.row}>
      <Text style={styles.label}>{`ΔPEAK ${unitLabel}`.trim()}</Text>
      {model.columns.map((column) => {
        const egt = column.cells.egt;
        if (column.kind !== 'piston' || egt === undefined) {
          return <View key={column.engine} style={styles.cell} />;
        }
        const delta = leanDelta(egt, peaks[column.engine], units);
        return (
          <View
            key={column.engine}
            style={styles.cell}
            accessible
            accessibilityLabel={delta.spoken}
          >
            <Text style={[styles.value, { color: toneColour(theme, 'normal', stale) }]}>
              {delta.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The ENGINES page's body (spec §4.10): a row of dials, one per engine, sized to share `width`
 * (at most 180 dp), then one row per gauge with its legend and unit once and a cell per engine.
 * `peaks` is non-null while lean assist is on.
 */
export function EngineTable({
  model,
  peaks,
  stale,
  width,
}: {
  model: EnginesModel;
  peaks: Peaks | null;
  stale: boolean;
  width: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const count = Math.max(1, model.columns.length);
  const dialSize = Math.max(
    MIN_DIAL,
    Math.min(MAX_DIAL_SIZE, Math.floor((width - GAP * (count - 1)) / count)),
  );
  const dials = model.columns.some((column) => column.dial !== null);
  return (
    <View style={styles.root}>
      {dials ? (
        <View testID="engine-dials" style={styles.dials}>
          {model.columns.map((column) =>
            column.dial === null ? (
              <View key={column.engine} style={{ width: dialSize }} />
            ) : (
              <GaugeDial key={column.engine} reading={column.dial} size={dialSize} stale={stale} />
            ),
          )}
        </View>
      ) : null}
      {model.rows.map((row) => (
        <React.Fragment key={row.id}>
          <View testID={`engine-row-${row.id}`} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            {model.columns.map((column) => (
              <GaugeCell
                key={column.engine}
                reading={column.cells[row.id]}
                id={row.id}
                engine={column.engine}
                stale={stale}
                peak={row.id === 'egt' && peaks !== null ? (peaks[column.engine] ?? null) : null}
              />
            ))}
          </View>
          {row.id === 'egt' && peaks !== null ? (
            <LeanRow
              model={model}
              peaks={peaks}
              unitLabel={row.label.slice('EGT'.length)}
              stale={stale}
            />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}
