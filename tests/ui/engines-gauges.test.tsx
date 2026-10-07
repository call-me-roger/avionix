import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import type { GaugeReading } from '@/domain/engines/engine-page';
import { GaugeBar } from '@/features/panels/engines/GaugeBar';
import { GaugeDial } from '@/features/panels/engines/GaugeDial';
import { ThemeProvider } from '@/theme/theme-context';

const LEGEND = '#e8eaed';
const DIM = '#8b949e';
const CAUTION = '#ffb300';
const WARNING = '#ff4a3d';
const GREEN = '#36d35a';

function themed(node: React.ReactElement) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      {node}
    </ThemeProvider>
  );
}

// GaugeBar hides itself from accessibility (the cell that holds it speaks instead), so RNTL 14's
// default query filtering excludes its testIDs unless hidden elements are explicitly included —
// the same convention the PFD tests use for pfd-mach, pfd-baro and the nav cues.
const HIDDEN = { includeHiddenElements: true };
const style = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, HIDDEN).props.style);

const SCALE = { min: 0, max: 200, redline: null };

describe('GaugeBar', () => {
  it('draws each band from its edges and the pointer at the value, in the tone colour', async () => {
    await render(
      themed(
        <GaugeBar
          scale={SCALE}
          bands={[
            { colour: 'green', from: 50, to: 150 },
            { colour: 'yellow', from: 150, to: 180 },
          ]}
          value={160}
          tone="yellow"
          stale={false}
        />,
      ),
    );
    expect(style('gauge-band-green')).toMatchObject({
      left: '25%',
      width: '50%',
      backgroundColor: GREEN,
    });
    expect(style('gauge-band-yellow')).toMatchObject({ left: '75%', width: '15%' });
    expect(style('gauge-pointer')).toMatchObject({ left: '80%', backgroundColor: CAUTION });
    expect(screen.queryByTestId('gauge-redline')).toBeNull();
    expect(screen.queryByTestId('gauge-peak')).toBeNull();
  });

  it('draws the redline and the lean peak as ticks, and no pointer without a value', async () => {
    await render(
      themed(
        <GaugeBar
          scale={{ min: 0, max: 2970, redline: 2700 }}
          bands={[]}
          value={null}
          tone="normal"
          stale={false}
          peak={1485}
        />,
      ),
    );
    expect(style('gauge-redline')).toMatchObject({ left: '90.9%', backgroundColor: WARNING });
    expect(style('gauge-peak')).toMatchObject({ left: '50%', backgroundColor: LEGEND });
    expect(screen.queryByTestId('gauge-pointer')).toBeNull();
  });

  it('dims everything when the values are not current', async () => {
    await render(
      themed(
        <GaugeBar
          scale={SCALE}
          bands={[{ colour: 'red', from: 180, to: 200 }]}
          value={190}
          tone="red"
          stale
        />,
      ),
    );
    expect(style('gauge-pointer').backgroundColor).toBe(DIM);
    expect(style('gauge-band-red').backgroundColor).toBe(DIM);
  });
});

const RPM: GaugeReading = {
  engine: 1,
  id: 'rpm',
  legend: 'RPM',
  value: 2350,
  source: null,
  text: '2,350',
  scale: { min: 0, max: 2970, redline: 2700 },
  bands: [],
  tone: 'normal',
  spoken: 'Engine 1 RPM 2,350',
};

describe('GaugeDial', () => {
  it('is one element spoken as the reading, with its number, legend, needle and redline', async () => {
    await render(themed(<GaugeDial reading={RPM} size={180} stale={false} />));
    expect(screen.getByLabelText('Engine 1 RPM 2,350')).toBeTruthy();
    expect(screen.getByTestId('dial-1').props.accessibilityRole).toBe('image');
    expect(screen.getByTestId('dial-value-1').props.children).toBe('2,350');
    expect(screen.getByText('RPM')).toBeTruthy();
    expect(screen.getByTestId('dial-needle')).toBeTruthy();
    expect(screen.getByTestId('dial-redline')).toBeTruthy();
  });

  it('draws the bands and colours the number by tone', async () => {
    await render(
      themed(
        <GaugeDial
          reading={{
            ...RPM,
            id: 'trq',
            legend: 'TRQ',
            value: 1900,
            text: '1,900',
            scale: { min: 0, max: 2200, redline: null },
            bands: [
              { colour: 'green', from: 0, to: 1800 },
              { colour: 'red', from: 1800, to: 2000 },
            ],
            tone: 'red',
          }}
          size={120}
          stale={false}
        />,
      ),
    );
    expect(screen.getByTestId('dial-band-green')).toBeTruthy();
    expect(screen.getByTestId('dial-band-red')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('dial-value-1').props.style).color).toBe(WARNING);
  });

  it('draws only the number on a gauge with no scale', async () => {
    await render(
      themed(
        <GaugeDial
          reading={{ ...RPM, id: 'trq', legend: 'TRQ', scale: null, text: '900' }}
          size={120}
          stale
        />,
      ),
    );
    expect(screen.queryByTestId('dial-needle')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('dial-value-1').props.style).color).toBe(DIM);
  });

  it.each([64, 180])('keeps the value text inside its box at size %d', async (size) => {
    await render(themed(<GaugeDial reading={RPM} size={size} stale={false} />));
    const face = StyleSheet.flatten(screen.getByTestId('dial-face-1').props.style);
    const value = StyleSheet.flatten(screen.getByTestId('dial-value-1').props.style);
    const top = value.top as number;
    const lineHeight = value.lineHeight as number;
    expect(top + lineHeight).toBeLessThanOrEqual(face.height as number);
  });
});
