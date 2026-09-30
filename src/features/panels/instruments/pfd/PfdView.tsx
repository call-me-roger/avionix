import React from 'react';
import { Text, View } from 'react-native';

import { PFD_VIEW } from '@/domain/instruments/geometry';
import { machShown, radioAltitudeShown } from '@/domain/instruments/labels';
import { NOT_LIVE_OPACITY } from '@/features/panels/instruments/InstrumentFace';
import { AltitudeTape } from '@/features/panels/instruments/pfd/AltitudeTape';
import { AttitudeDisplay } from '@/features/panels/instruments/pfd/AttitudeDisplay';
import { HeadingTape } from '@/features/panels/instruments/pfd/HeadingTape';
import { SpeedTape } from '@/features/panels/instruments/pfd/SpeedTape';
import { TurnRateScale } from '@/features/panels/instruments/pfd/TurnRateScale';
import { VsiScale } from '@/features/panels/instruments/pfd/VsiScale';
import { useInstrumentValues } from '@/features/panels/instruments/useInstrumentValues';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useTheme } from '@/theme/theme-context';

/** Three decimals without the leading zero, as airliner PFDs show it: "M .78" would lose a digit. */
const machText = (mach: number): string => `M ${mach.toFixed(3).replace(/^0/, '')}`;

/**
 * Speed left, attitude centre, altitude and vertical speed right, heading and turn rate below — each
 * region its own instrument, so each keeps its own label and its own not-live red X. The Mach,
 * altimeter-setting and radio-altitude boxes are read aloud as part of the airspeed and altitude
 * labels. The boxes fade with the link rather than with a face's status: a setting can be read with
 * no altitude to show. Radio altitude sits low on the attitude but is drawn here, over it, so an
 * attitude with no value (whose face draws nothing of its own) still shows it, as the six-pack does.
 */
export function PfdView({ width }: { width: number }) {
  const ink = useTheme().instrument;
  const v = useInstrumentValues();
  const { link } = usePanel();
  const k = width / PFD_VIEW.width;
  const box = (boxWidth: number) => ({
    width: boxWidth * k,
    height: 40 * k,
    backgroundColor: ink.face,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: link.valuesCurrent ? 1 : NOT_LIVE_OPACITY,
  });
  const airspeedShown = v.airspeed.status === 'live' || v.airspeed.status === 'notLive';
  const altitudeShown = v.altitude.status === 'live' || v.altitude.status === 'notLive';
  const boxText = { color: ink.marking, fontSize: 14 * k, fontWeight: 'bold' as const };
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  };
  return (
    <View testID="pfd" style={{ width, backgroundColor: ink.face }}>
      <View style={{ flexDirection: 'row' }}>
        <SpeedTape width={60 * k} height={240 * k} {...v.airspeed} markings={v.markings} />
        <AttitudeDisplay width={200 * k} height={240 * k} {...v.attitude} slip={v.turn.slip} />
        <AltitudeTape
          width={60 * k}
          height={240 * k}
          status={v.altitude.status}
          feet={v.altitude.feet}
          baroWords={v.altitude.baroWords}
          radioAltitude={v.altitude.radioAltitude}
        />
        <VsiScale width={40 * k} height={240 * k} {...v.verticalSpeed} />
        {altitudeShown && radioAltitudeShown(v.altitude.radioAltitude) ? (
          // Centred low on the attitude (its viewBox is 200 × 240 at the same scale), clear of the
          // aircraft symbol and the roll pointer.
          <View
            testID="pfd-radio-altitude"
            pointerEvents="none"
            style={{
              ...box(60),
              position: 'absolute',
              left: (60 + 100 - 30) * k,
              top: (222 - 11) * k,
              height: 22 * k,
              borderWidth: 1.5 * k,
              borderColor: ink.marking,
              borderRadius: 3 * k,
            }}
            {...hidden}
          >
            <Text style={boxText}>{String(Math.round(v.altitude.radioAltitude))}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View testID="pfd-mach" style={box(60)} {...hidden}>
          {airspeedShown && machShown(v.airspeed.mach) ? (
            <Text style={boxText}>{machText(v.airspeed.mach)}</Text>
          ) : null}
        </View>
        <HeadingTape width={200 * k} height={40 * k} {...v.heading} />
        <View testID="pfd-baro" style={box(100)} {...hidden}>
          <Text style={boxText}>{v.altitude.baroText ?? '—'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingLeft: 60 * k }}>
        <TurnRateScale width={200 * k} height={20 * k} {...v.turn} />
      </View>
    </View>
  );
}
