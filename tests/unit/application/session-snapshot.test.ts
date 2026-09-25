import { snapshotDataRefNames } from '@/application/compatibility';
import { initialHealth, initialSnapshot } from '@/application/session-snapshot';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';

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
  it('carries health and a diagnostics entry for every dataref the profile declares', () => {
    const snapshot = initialSnapshot(GENERIC_PROFILE, 5);
    expect(snapshot.health.reconnectBudget).toBe(5);
    expect(Object.keys(snapshot.diagnostics.dataRefs).sort()).toEqual(
      snapshotDataRefNames(GENERIC_PROFILE).sort(),
    );
  });

  it('starts on the given profile with nothing identified or checked', () => {
    const snapshot = initialSnapshot(GENERIC_PROFILE);
    expect(snapshot.compatibility.profileId).toBe(GENERIC_PROFILE.id);
    expect(snapshot.compatibility.checkedAt).toBeNull();
  });
});
