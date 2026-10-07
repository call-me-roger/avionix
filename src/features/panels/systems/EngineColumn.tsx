import React from 'react';
import { Text, View } from 'react-native';

import { STARTER_HOLD_CAP_MS } from '@/domain/panels/hold-lease';
import {
  ENGINES,
  FEATURE_ENGINE_START,
  fuelPumpSwitch,
  generatorSwitch,
  magnetoPositions,
  starterCommand,
} from '@/domain/systems/controls';
import { holdCapped, holdNoResponse } from '@/domain/systems/messages';
import { type EngineColumn as Column, numberAt, switchOn } from '@/domain/systems/readouts';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { LightBar } from '@/features/panels/primitives/LightBar';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useHoldControl } from '@/features/panels/primitives/useHoldControl';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  bindingMissing,
  bindingOk,
  featureUsable,
  presence,
  valueOf,
} from '@/features/panels/systems/availability';
import { SelectorKeys, selectorMissing } from '@/features/panels/systems/SelectorKeys';
import { UnitLines } from '@/features/panels/systems/SwitchGroup';
import { SwitchKey } from '@/features/panels/systems/SwitchKey';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  key: { flex: 1 },
  run: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing.xs },
  lamp: { width: 40 },
  runText: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
});

/**
 * One engine's controls (spec §4.6): GEN, FUEL PUMP, the magnetos (piston engines only), START
 * (armed by a tap, cranks only while held; on its own row, never beside a confirm-only key, §4.7)
 * and the RUN lamp. Each is drawn when its state resolved (S3); the unit names what is not usable.
 */
export function EngineColumn({
  column,
  single,
  readBack,
}: {
  column: Column;
  single: boolean;
  readBack: ReadBack;
}) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const n = column.engine;
  const aircraft = aircraftName(snapshot);
  const generator = generatorSwitch(n);
  const pump = fuelPumpSwitch(n);
  const magnetos = magnetoPositions(n);
  const starter = presence(snapshot, ENGINES.starter, [starterCommand(n)]);
  const cranking = switchOn(valueOf(snapshot, ENGINES.starter), n - 1);
  const running = switchOn(valueOf(snapshot, ENGINES.running), n - 1);

  const control = useHoldControl({
    featureId: FEATURE_ENGINE_START,
    command: starterCommand(n),
    capMs: STARTER_HOLD_CAP_MS,
    enabled: starter.enabled && featureUsable(snapshot, FEATURE_ENGINE_START),
    name: `starter ${n}`,
    value: numberAt(valueOf(snapshot, ENGINES.starter), n - 1),
    cappedMessage: holdCapped(
      `starter ${n}`,
      STARTER_HOLD_CAP_MS / 1000,
      'Press START again to keep cranking.',
    ),
    noResponseMessage: holdNoResponse(aircraft, `engage starter ${n}`),
  });

  const missing = [
    ...[generator, pump]
      .filter((spec) => presence(snapshot, spec.state, [spec.on, spec.off]).missing)
      .map((spec) => spec.legend),
    ...(column.piston && selectorMissing(snapshot, ENGINES.key, magnetos).length > 0
      ? ['MAGNETOS']
      : []),
    ...(starter.missing ? ['START'] : []),
    ...(bindingMissing(snapshot, ENGINES.running) ? ['RUN'] : []),
  ];

  return (
    <AvionicsUnit label={single ? 'ENGINE' : `ENGINE ${n}`}>
      <View style={styles.row}>
        <SwitchKey spec={generator} readBack={readBack} style={styles.key} />
        <SwitchKey spec={pump} readBack={readBack} style={styles.key} />
      </View>
      {column.piston ? (
        <SelectorKeys
          label="MAGNETOS"
          what={`magnetos ${n}`}
          featureId={FEATURE_ENGINE_START}
          state={ENGINES.key}
          index={n - 1}
          positions={magnetos}
          keyPrefix={`magnetos${n}`}
          readBack={readBack}
        />
      ) : null}
      {starter.shown ? (
        <ControlButton
          label="START"
          accessibilityLabel={cranking === true ? `Starter ${n}, engaged` : `Starter ${n}`}
          annunciation={cranking === true ? 'engaged' : 'off'}
          featureId={FEATURE_ENGINE_START}
          target={starterCommand(n)}
          confirm
          invalid={!starter.enabled}
          onPress={() => undefined}
          hold={{ onStart: control.start, onEnd: control.end, armedLegend: 'HOLD TO START' }}
        />
      ) : null}
      {bindingOk(snapshot, ENGINES.running) ? (
        <View
          style={styles.run}
          accessible
          accessibilityLabel={running === true ? `Engine ${n} running` : `Engine ${n} not running`}
        >
          <View style={styles.lamp}>
            <LightBar state={running === true ? 'engaged' : 'off'} dim={!link.valuesCurrent} />
          </View>
          <Text style={styles.runText}>RUN</Text>
        </View>
      ) : null}
      <UnitLines
        missing={missing}
        readBack={readBack}
        keys={[generator.key, pump.key, `magnetos${n}`]}
        notes={[control.message]}
      />
    </AvionicsUnit>
  );
}
