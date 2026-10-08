import { findFeature } from '@/domain/aircraft/profile';
import { GENERIC_DATAREFS, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  AUDIO_FEATURES,
  AUDIO_STATE_NAMES,
  FEATURE_AUDIO_MARKER,
  FEATURE_AUDIO_MONITOR,
  FEATURE_AUDIO_TRANSMIT,
  MARKER_LAMPS,
  MICS,
  MONITORS,
  TRANSMIT,
  comForSelection,
} from '@/domain/audio/catalogue';

describe('the audio catalogue', () => {
  it('uses Laminar’s names (spec §3)', () => {
    expect(TRANSMIT).toEqual({
      selection: 'sim/cockpit2/radios/actuators/audio_com_selection',
      autoListen: 'sim/cockpit2/radios/actuators/audio_selection_com_auto',
    });
    expect(MICS.map((mic) => [mic.legend, mic.value, mic.command])).toEqual([
      ['COM1 MIC', 6, 'sim/audio_panel/transmit_audio_com1'],
      ['COM2 MIC', 7, 'sim/audio_panel/transmit_audio_com2'],
    ]);
    expect(MONITORS.map((m) => [m.legend, m.state, m.on, m.off])).toEqual([
      [
        'COM1',
        'sim/cockpit2/radios/actuators/audio_selection_com1',
        'sim/audio_panel/monitor_audio_com1_on',
        'sim/audio_panel/monitor_audio_com1_off',
      ],
      [
        'COM2',
        'sim/cockpit2/radios/actuators/audio_selection_com2',
        'sim/audio_panel/monitor_audio_com2_on',
        'sim/audio_panel/monitor_audio_com2_off',
      ],
      [
        'NAV1',
        'sim/cockpit2/radios/actuators/audio_selection_nav1',
        'sim/audio_panel/monitor_audio_nav1_on',
        'sim/audio_panel/monitor_audio_nav1_off',
      ],
      [
        'NAV2',
        'sim/cockpit2/radios/actuators/audio_selection_nav2',
        'sim/audio_panel/monitor_audio_nav2_on',
        'sim/audio_panel/monitor_audio_nav2_off',
      ],
      [
        'ADF',
        'sim/cockpit2/radios/actuators/audio_selection_adf1',
        'sim/audio_panel/monitor_audio_adf1_on',
        'sim/audio_panel/monitor_audio_adf1_off',
      ],
      [
        'DME',
        'sim/cockpit2/radios/actuators/audio_dme_enabled',
        'sim/audio_panel/monitor_audio_dme_on',
        'sim/audio_panel/monitor_audio_dme_off',
      ],
      [
        'MKR',
        'sim/cockpit2/radios/actuators/audio_marker_enabled',
        'sim/audio_panel/monitor_audio_mkr_on',
        'sim/audio_panel/monitor_audio_mkr_off',
      ],
    ]);
    expect(MONITORS.map((m) => m.com)).toEqual([
      1,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(MONITORS.map((m) => m.featureId)).toEqual([
      ...new Array(6).fill(FEATURE_AUDIO_MONITOR),
      FEATURE_AUDIO_MARKER,
    ]);
    expect(AUDIO_STATE_NAMES).toEqual([TRANSMIT.selection, ...MONITORS.map((m) => m.state)]);
  });

  it('shares the marker lamps with nav-aids', () => {
    expect(MARKER_LAMPS.map((lamp) => lamp.state)).toEqual([
      GENERIC_DATAREFS.outerMarker,
      GENERIC_DATAREFS.middleMarker,
      GENERIC_DATAREFS.innerMarker,
    ]);
    expect(MARKER_LAMPS.map((lamp) => lamp.marker)).toEqual(['outer', 'middle', 'inner']);
  });

  it('maps 6 and 7 to COM1 and COM2, anything else to none', () => {
    expect(comForSelection(6)).toBe(1);
    expect(comForSelection(7)).toBe(2);
    for (const other of [0, 9, 6.5, -6, NaN, null]) {
      expect(comForSelection(other)).toBeNull();
    }
  });
});

describe('profile 1.9.0', () => {
  it('declares the three audio features, every binding optional and none written', () => {
    expect(GENERIC_PROFILE.version).toBe('1.10.0');
    expect(AUDIO_FEATURES).toEqual([
      FEATURE_AUDIO_TRANSMIT,
      FEATURE_AUDIO_MONITOR,
      FEATURE_AUDIO_MARKER,
    ]);
    for (const id of AUDIO_FEATURES) {
      const feature = findFeature(GENERIC_PROFILE, id);
      expect(feature).toBeDefined();
      for (const binding of feature!.bindings) {
        expect(binding.required).toBe(false);
        expect(binding.write).toBeUndefined();
        expect(binding.purpose).not.toMatch(/sim\/|_/);
      }
    }
    const names = (id: string) => findFeature(GENERIC_PROFILE, id)!.bindings.map((b) => b.name);
    expect(names(FEATURE_AUDIO_TRANSMIT)).toEqual([
      TRANSMIT.selection,
      TRANSMIT.autoListen,
      ...MICS.map((mic) => mic.command),
    ]);
    expect(names(FEATURE_AUDIO_MONITOR)).toEqual(
      MONITORS.slice(0, 6).flatMap((m) => [m.state, m.on, m.off]),
    );
    expect(names(FEATURE_AUDIO_MARKER)).toEqual([
      MONITORS[6]!.state,
      MONITORS[6]!.on,
      MONITORS[6]!.off,
      ...MARKER_LAMPS.map((lamp) => lamp.state),
    ]);
  });
});
