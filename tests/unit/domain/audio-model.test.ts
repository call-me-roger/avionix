import { type AudioReader, audioModel } from '@/domain/audio/audio-model';
import {
  AUDIO_STATE_NAMES,
  MARKER_LAMPS,
  MICS,
  MONITORS,
  TRANSMIT,
} from '@/domain/audio/catalogue';
import { audioUnavailable, listenNotTaken, micNotTaken, notHeard } from '@/domain/audio/messages';

type Answer = 'ok' | 'missing' | 'unchecked';

const ALL_NAMES = [
  TRANSMIT.selection,
  TRANSMIT.autoListen,
  ...MICS.map((mic) => mic.command),
  ...MONITORS.flatMap((m) => [m.state, m.on, m.off]),
  ...MARKER_LAMPS.map((lamp) => lamp.state),
];

const BASE: Record<string, number> = {
  [TRANSMIT.selection]: 6,
  [TRANSMIT.autoListen]: 0,
  ...Object.fromEntries(MONITORS.map((m) => [m.state, 0])),
  ...Object.fromEntries(MARKER_LAMPS.map((lamp) => [lamp.state, 0])),
};

function reader(
  values: Record<string, number | null> = {},
  answers: Record<string, Answer> = {},
): AudioReader {
  const merged: Record<string, number | null> = { ...BASE, ...values };
  const answer = (name: string): Answer => answers[name] ?? 'ok';
  return {
    has: (name) => answer(name) === 'ok',
    missing: (name) => answer(name) === 'missing',
    number: (name) => (answer(name) === 'ok' ? (merged[name] ?? null) : null),
  };
}

const every = (answer: Answer, names: readonly string[] = ALL_NAMES) =>
  Object.fromEntries(names.map((name) => [name, answer]));

const listening = (model: ReturnType<typeof audioModel>) =>
  Object.fromEntries(model.monitors.map((key) => [key.spec.legend, key.listening]));

describe('audioModel', () => {
  it('reads the MIC selection and every listen flag', () => {
    const model = audioModel(reader({ [MONITORS[0]!.state]: 1, [MONITORS[6]!.state]: 1 }));
    expect(model.status).toBe('ready');
    expect(model.transmitting).toBe(1);
    expect(model.mics.map((mic) => [mic.spec.legend, mic.selected, mic.enabled])).toEqual([
      ['COM1 MIC', true, true],
      ['COM2 MIC', false, true],
    ]);
    expect(listening(model)).toEqual({
      COM1: 'on',
      COM2: 'off',
      NAV1: 'off',
      NAV2: 'off',
      ADF: 'off',
      DME: 'off',
      MKR: 'on',
    });
    expect(model.notHeard).toBeNull();
    expect(model.missing).toEqual([]);
    expect(model.lamps).toEqual({ outer: false, middle: false, inner: false });
  });

  it('selects no MIC, keeping both pressable, for a known selection other than 6 or 7', () => {
    for (const value of [0, 9, 6.4]) {
      const model = audioModel(reader({ [TRANSMIT.selection]: value }));
      expect(model.transmitting).toBeNull();
      expect(model.selectionKnown).toBe(true);
      expect(model.mics.map((mic) => [mic.selected, mic.enabled])).toEqual([
        [false, true],
        [false, true],
      ]);
      expect(model.notHeard).toBeNull();
    }
  });

  it('makes both MIC keys inert while the selection value has not arrived', () => {
    const model = audioModel(reader({ [TRANSMIT.selection]: null }));
    expect(model.transmitting).toBeNull();
    expect(model.selectionKnown).toBe(false);
    expect(model.mics.map((mic) => [mic.selected, mic.enabled])).toEqual([
      [false, false],
      [false, false],
    ]);
    expect(model.notHeard).toBeNull();
  });

  it('hears the transmitting COM through auto-listen, whatever its own flag says', () => {
    const model = audioModel(reader({ [TRANSMIT.selection]: 7, [TRANSMIT.autoListen]: 1 }));
    expect(listening(model)).toMatchObject({ COM1: 'off', COM2: 'auto' });
    expect(model.notHeard).toBeNull();
  });

  it('says when the transmitting COM is not heard', () => {
    const model = audioModel(reader({ [TRANSMIT.selection]: 6 }));
    expect(model.notHeard).toBe(1);
  });

  it('does not claim "not heard" when the COM’s flag is unknown or missing', () => {
    expect(audioModel(reader({ [MONITORS[0]!.state]: null })).notHeard).toBeNull();
    expect(audioModel(reader({}, { [MONITORS[0]!.state]: 'missing' })).notHeard).toBeNull();
  });

  it('keeps the transmitting COM unknown while the auto-listen value has not arrived', () => {
    const model = audioModel(reader({ [TRANSMIT.autoListen]: null }));
    expect(listening(model)).toMatchObject({ COM1: 'unknown', COM2: 'off' });
    expect(model.monitors[0]!.listening).toBe('unknown');
    expect(model.notHeard).toBeNull();
  });

  it('reads every flag, auto-listen and lamp as on only above one half', () => {
    const half = audioModel(
      reader({
        [MONITORS[1]!.state]: 0.5,
        [MONITORS[2]!.state]: 0.7,
        [TRANSMIT.autoListen]: 0.5,
        [MARKER_LAMPS[0]!.state]: 0.5,
        [MARKER_LAMPS[2]!.state]: 0.8,
      }),
    );
    expect(listening(half)).toMatchObject({ COM1: 'off', COM2: 'off', NAV1: 'on' });
    expect(half.lamps).toEqual({ outer: false, middle: false, inner: true });
    const auto = audioModel(reader({ [TRANSMIT.autoListen]: 0.8 }));
    expect(listening(auto).COM1).toBe('auto');
  });

  it('keeps the transmitting COM unknown while the auto-listen name is unchecked', () => {
    const model = audioModel(reader({}, { [TRANSMIT.autoListen]: 'unchecked' }));
    expect(listening(model).COM1).toBe('unknown');
    expect(model.notHeard).toBeNull();
  });

  it('treats a missing auto-listen flag as off', () => {
    const model = audioModel(reader({}, { [TRANSMIT.autoListen]: 'missing' }));
    expect(listening(model).COM1).toBe('off');
    expect(model.missing).toEqual([]);
  });

  it('lists definitive misses only, MIC keys first', () => {
    const model = audioModel(
      reader(
        {},
        {
          [MICS[1]!.command]: 'missing',
          [MONITORS[5]!.state]: 'missing',
          [MONITORS[6]!.off]: 'missing',
          [MONITORS[4]!.state]: 'unchecked',
        },
      ),
    );
    expect(model.missing).toEqual(['COM2 MIC', 'DME', 'MKR']);
    expect(model.mics.map((mic) => mic.enabled)).toEqual([true, false]);
    expect(model.monitors.map((key) => key.spec.legend)).toEqual([
      'COM1',
      'COM2',
      'NAV1',
      'NAV2',
      'MKR',
    ]);
    expect(model.monitors.find((key) => key.spec.legend === 'MKR')!.enabled).toBe(false);
  });

  it('lists both MIC keys when the selection itself is missing, and draws none', () => {
    const model = audioModel(reader({}, { [TRANSMIT.selection]: 'missing' }));
    expect(model.mics).toEqual([]);
    expect(model.missing).toEqual(['COM1 MIC', 'COM2 MIC']);
    expect(model.transmitting).toBeNull();
  });

  it('waits, saying nothing, while names are unchecked', () => {
    const model = audioModel(reader({}, every('unchecked')));
    expect(model.status).toBe('waiting');
    expect(model.missing).toEqual([]);
    expect(model.lamps).toBeNull();
  });

  it('keeps waiting when some names are missing and the rest unchecked', () => {
    const answers = { ...every('unchecked'), [TRANSMIT.selection]: 'missing' as const };
    expect(audioModel(reader({}, answers)).status).toBe('waiting');
  });

  it('is unavailable only when every state name is definitively missing', () => {
    const model = audioModel(reader({}, every('missing', AUDIO_STATE_NAMES)));
    expect(model.status).toBe('unavailable');
    expect(model.missing).toEqual([]);
  });

  it('shows the lamps only when all three resolved', () => {
    expect(audioModel(reader({ [MARKER_LAMPS[1]!.state]: 1 })).lamps).toEqual({
      outer: false,
      middle: true,
      inner: false,
    });
    expect(audioModel(reader({}, { [MARKER_LAMPS[2]!.state]: 'missing' })).lamps).toBeNull();
  });

  it('shows no lamps until all three values arrived', () => {
    expect(audioModel(reader({ [MARKER_LAMPS[0]!.state]: null })).lamps).toBeNull();
  });
});

describe('audio sentences', () => {
  it('reads as plain words naming the aircraft', () => {
    expect(audioUnavailable('Cessna 172')).toBe(
      "The audio panel isn't available on the Cessna 172.",
    );
    expect(audioUnavailable(null)).toBe("The audio panel isn't available on this aircraft.");
    expect(notHeard(1)).toBe("You transmit on COM1 but aren't listening to it.");
    expect(micNotTaken('Cessna 172', 2)).toBe(
      "The Cessna 172 didn't switch the microphone to COM2.",
    );
    expect(micNotTaken(null, 1)).toBe("This aircraft didn't switch the microphone to COM1.");
    expect(listenNotTaken('Cessna 172', 'COM2', true)).toBe(
      "The Cessna 172 didn't start listening to COM2.",
    );
    expect(listenNotTaken(null, 'the marker beacons', false)).toBe(
      "This aircraft didn't stop listening to the marker beacons.",
    );
  });
});
