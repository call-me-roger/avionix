import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { FEATURE_MOVING_MAP, MAP_DATAREFS as M } from '@/domain/map/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { MapPanel } from '@/features/panels/map/MapPanel';
import { MapPreferenceProvider } from '@/features/panels/map/MapPreferenceProvider';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

type Status = 'ok' | 'missing' | 'unchecked';

export const MAP_NOW = 1_000_000;

/** Every moving-map binding resolved unless overridden ('unchecked' leaves no result). */
export function mapCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = { ...base.bindings };
  const feature = GENERIC_PROFILE.features.find(
    (candidate) => candidate.id === FEATURE_MOVING_MAP,
  )!;
  for (const binding of feature.bindings) {
    const status = overrides[binding.name] ?? 'ok';
    if (status === 'unchecked') {
      delete bindings[binding.name];
    } else {
      bindings[binding.name] = { name: binding.name, kind: binding.kind, status };
    }
  }
  const derived = deriveAvailability(GENERIC_PROFILE, bindings);
  return {
    ...base,
    bindings,
    features: base.features.map((candidate) =>
      candidate.id === FEATURE_MOVING_MAP
        ? (derived.find((next) => next.id === candidate.id) ?? candidate)
        : candidate,
    ),
  };
}

/** Over Seattle–Tacoma, 140 kt, true track 090, true heading 085, magnetic track 075. */
export const MAP_VALUES: Record<string, DataRefValue> = {
  [M.latitude]: 47.449,
  [M.longitude]: -122.3093,
  [M.elevation]: 132,
  [M.trueHeading]: 85,
  [M.trueTrack]: 90,
  [D.groundSpeed]: 140,
  [D.groundTrack]: 75,
};

export function mapTelemetry(
  values: Record<string, DataRefValue>,
  receivedAt: number,
): SessionSnapshot['telemetry'] {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

export function mapSnapshot({
  values = {},
  absent = [],
  bindings = {},
  stale = false,
  noFlight = false,
}: {
  values?: Record<string, DataRefValue>;
  /** Resolved names whose value has not arrived (dropped telemetry on a panel switch). */
  absent?: readonly string[];
  bindings?: Partial<Record<string, Status>>;
  stale?: boolean;
  noFlight?: boolean;
} = {}): SessionSnapshot {
  return {
    ...base,
    state: stale ? 'reconnecting' : 'connected',
    health: {
      ...base.health,
      activity: noFlight ? 'noFlight' : 'running',
      live: true,
      lastHeartbeatAt: MAP_NOW,
    },
    telemetry: mapTelemetry(
      Object.fromEntries(
        Object.entries({ ...MAP_VALUES, ...values }).filter(([name]) => !absent.includes(name)),
      ),
      MAP_NOW,
    ),
    compatibility: mapCompatibility(identified, bindings),
  };
}

const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

/** The Map panel as AppShell mounts it, with real (memory) persistence. */
export function mapTree(
  snap: SessionSnapshot,
  {
    storage = createMemorySettingsStorage(),
    now = MAP_NOW,
  }: { storage?: SettingsStorage; now?: number } = {},
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <MapPreferenceProvider storage={storage}>
          <PanelFrame title="Map" snapshot={snap} now={now} actions={actions} fillsFrame>
            <MapPanel />
          </PanelFrame>
        </MapPreferenceProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

/** The symbol's screen x, read from its `translate(x y)`: pan moves it, nothing else does. */
export function symbolX(transform: string): number {
  const match = /translate\(([-\d.e]+)/.exec(transform);
  return match === null ? Number.NaN : Number(match[1]);
}

interface SvgNode {
  props: Record<string, unknown>;
  children: readonly unknown[];
}

/**
 * react-native-svg hands a group's `transform` to the native view as a matrix `[a b c d e f]`;
 * this reads it back as the `translate(e f) rotate(θ)` the map wrote, rounded to 0.001.
 */
export function transformOf(node: SvgNode): string {
  const matrix = node.props.matrix;
  if (!Array.isArray(matrix) || matrix.length !== 6) {
    return '';
  }
  const [a, b, , , e, f] = matrix as number[];
  const r = (value: number) => String(Math.round(value * 1000) / 1000 || 0);
  return `translate(${r(e!)} ${r(f!)}) rotate(${r((Math.atan2(b!, a!) * 180) / Math.PI)})`;
}

/** An `SvgText`'s string, which react-native-svg passes to its span as `content`, not as text. */
export function svgText(node: SvgNode): string {
  const span = node.children[0] as { props?: { content?: unknown } } | undefined;
  return String(span?.props?.content ?? '');
}
