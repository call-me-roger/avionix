import {
  ENGINES_NOT_SHOWN,
  dimmerNotTaken,
  flapsNotTaken,
  gearNotTaken,
  holdBackgrounded,
  holdCapped,
  holdLinkLost,
  holdNoResponse,
  missingControls,
  parkingBrakeNotTaken,
  selectorNotTaken,
  switchNotTaken,
  trimSetNotTaken,
  unitUnavailable,
} from '@/domain/systems/messages';

describe('systems sentences', () => {
  it('names the aircraft, or says "this aircraft"', () => {
    expect(switchNotTaken('Cessna 172', 'beacon', true, false)).toBe(
      "The Cessna 172 didn't turn the beacon on. It's still off.",
    );
    expect(switchNotTaken(null, 'beacon', false, null)).toBe(
      "This aircraft didn't turn the beacon off.",
    );
  });

  it('explains gear held down on the ground', () => {
    expect(gearNotTaken('Baron 58', false)).toBe(
      "The Baron 58 didn't move the gear handle up. X-Plane keeps the gear down while the aircraft is on the ground.",
    );
    expect(gearNotTaken('Baron 58', true)).toBe("The Baron 58 didn't move the gear handle down.");
  });

  it('covers flaps, selectors, dimmers, the parking brake and set trim', () => {
    expect(flapsNotTaken('Cessna 172', 'down')).toBe("The Cessna 172 didn't move the flaps down.");
    expect(selectorNotTaken('Cessna 172', 'fuel selector', 'left')).toBe(
      "The Cessna 172 didn't set the fuel selector to left.",
    );
    expect(dimmerNotTaken(null, 'panel lights')).toBe(
      "This aircraft didn't change the panel lights.",
    );
    expect(parkingBrakeNotTaken('Cessna 172', false)).toBe(
      "The Cessna 172 didn't release the parking brake.",
    );
    expect(trimSetNotTaken('Cessna 172', 'set takeoff trim')).toBe(
      "The Cessna 172 didn't set takeoff trim.",
    );
  });

  it('words every way a hold can end badly', () => {
    expect(holdNoResponse('Cessna 172', 'move the pitch trim')).toBe(
      "The Cessna 172 didn't move the pitch trim.",
    );
    expect(holdCapped('pitch trim', 10, 'Press again to keep trimming.')).toBe(
      'Pitch trim stopped after 10 seconds. Press again to keep trimming.',
    );
    expect(holdLinkLost('pitch trim')).toBe(
      'Pitch trim released: the connection to X-Plane dropped.',
    );
    expect(holdBackgrounded('starter 1')).toBe('Starter 1 released: Avionix left the foreground.');
  });

  it('lists missing controls and unavailable units', () => {
    expect(missingControls('Cessna 172', ['STROBE', 'TAXI'])).toBe(
      'Not available on the Cessna 172: STROBE, TAXI.',
    );
    expect(missingControls(null, ['GEN'])).toBe('Not available on this aircraft: GEN.');
    expect(unitUnavailable('Anti-ice', 'Cessna 172')).toBe(
      "Anti-ice isn't available on the Cessna 172.",
    );
    expect(ENGINES_NOT_SHOWN).toBe("Engines 5 and up aren't shown.");
  });
});
