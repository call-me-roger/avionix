import {
  ALL_DATAREF_NAMES,
  BINDING_FEATURE,
  MVP_COMMAND_HEADING_UP,
  MVP_DATAREF_NAMES,
  OPTIONAL_DATAREFS,
  OPTIONAL_DATAREF_NAMES,
} from '@/application/mvp-bindings';
import { initialHealth, initialSnapshot } from '@/application/session-snapshot';

describe('initialHealth', () => {
  it('starts with nothing known and the link budget it was given', () => {
    const health = initialHealth(5);
    expect(health).toEqual({
      activity: 'unknown',
      live: false,
      lastHeartbeatValue: null,
      lastHeartbeatAt: null,
      flightLoaded: false,
      roundTripMs: null,
      roundTripAt: null,
      lastConnectedAt: null,
      lastEndedAt: null,
      lastEndReason: null,
      reconnectBudget: 5,
      nextRetryAt: null,
      readinessRetryAt: null,
    });
  });
});

describe('initialSnapshot', () => {
  it('carries health and a diagnostics entry for every name it was given', () => {
    const snapshot = initialSnapshot(ALL_DATAREF_NAMES, 5);
    expect(snapshot.health.reconnectBudget).toBe(5);
    expect(Object.keys(snapshot.diagnostics.dataRefs).sort()).toEqual(
      [...ALL_DATAREF_NAMES].sort(),
    );
  });
});

describe('bindings', () => {
  it('keeps the optional names out of the required set', () => {
    expect(OPTIONAL_DATAREF_NAMES).toEqual([OPTIONAL_DATAREFS.paused]);
    expect(MVP_DATAREF_NAMES).not.toContain(OPTIONAL_DATAREFS.paused);
    expect(ALL_DATAREF_NAMES).toEqual([...MVP_DATAREF_NAMES, ...OPTIONAL_DATAREF_NAMES]);
  });

  it('names the feature behind every binding, so diagnostics can say what broke', () => {
    for (const name of [...ALL_DATAREF_NAMES, MVP_COMMAND_HEADING_UP]) {
      expect(BINDING_FEATURE[name]).toBeTruthy();
    }
  });
});
