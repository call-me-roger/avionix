import type { FeatureAvailability } from '@/domain/aircraft/availability';
import { CONNECTION_STATES, type ConnectionState } from '@/domain/connection/connection-state';
import { NO_FEATURE_REASON, controlAvailability } from '@/domain/panels/control-availability';
import { deviceLayout, panelFit } from '@/domain/panels/device-layout';
import { shouldHoldScreenAwake } from '@/domain/panels/keep-awake-policy';
import { EVERYWHERE } from '@/domain/panels/panel';
import { panelLinkStatus } from '@/domain/panels/panel-link';

describe('deviceLayout', () => {
  it('classifies by the shortest side, so a phone stays a phone in landscape', () => {
    expect(deviceLayout(390, 844)).toEqual({ deviceClass: 'phone', orientation: 'portrait' });
    expect(deviceLayout(844, 390)).toEqual({ deviceClass: 'phone', orientation: 'landscape' });
    expect(deviceLayout(820, 1180)).toEqual({ deviceClass: 'tablet', orientation: 'portrait' });
    expect(deviceLayout(1180, 820)).toEqual({ deviceClass: 'tablet', orientation: 'landscape' });
  });

  it('puts the 600 dp boundary in the tablet class', () => {
    expect(deviceLayout(599, 900).deviceClass).toBe('phone');
    expect(deviceLayout(600, 900).deviceClass).toBe('tablet');
  });

  it('treats a square window as portrait', () => {
    expect(deviceLayout(700, 700).orientation).toBe('portrait');
  });
});

describe('panelFit', () => {
  const tabletLandscapeOnly = { supports: { phone: [], tablet: ['landscape' as const] } };

  it('fits everywhere a panel declares', () => {
    expect(panelFit({ supports: EVERYWHERE }, deviceLayout(390, 844))).toBe('fits');
    expect(panelFit(tabletLandscapeOnly, deviceLayout(1180, 820))).toBe('fits');
  });

  it('asks for a rotation when only the orientation is wrong', () => {
    expect(panelFit(tabletLandscapeOnly, deviceLayout(820, 1180))).toBe('rotate');
  });

  it('is unsupported on a device class the panel does not declare', () => {
    expect(panelFit(tabletLandscapeOnly, deviceLayout(390, 844))).toBe('unsupported');
    expect(panelFit(tabletLandscapeOnly, deviceLayout(844, 390))).toBe('unsupported');
  });
});

describe('panelLinkStatus', () => {
  const now = 100_000;

  it('treats a running simulator as live, with no notice', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'running', lastHeartbeatAt: now, now }),
    ).toEqual({ valuesCurrent: true, controlsEnabled: true, notice: null });
  });

  it('treats a paused simulator as current: pilots set up the aircraft while paused', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'paused', lastHeartbeatAt: 1, now }),
    ).toEqual({ valuesCurrent: true, controlsEnabled: true, notice: null });
  });

  it('says no flight is loaded', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'noFlight', lastHeartbeatAt: null, now }),
    ).toEqual({
      valuesCurrent: false,
      controlsEnabled: false,
      notice: 'No flight loaded in X-Plane.',
    });
  });

  it.each(['stalled', 'pausedOrStalled'] as const)(
    'says X-Plane stopped sending data when %s, with the age',
    (activity) => {
      expect(
        panelLinkStatus({ state: 'connected', activity, lastHeartbeatAt: now - 12_000, now }),
      ).toEqual({
        valuesCurrent: false,
        controlsEnabled: false,
        notice: 'X-Plane stopped sending data. Last update 12 s ago.',
      });
    },
  );

  it('drops the age when there has never been an update', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'stalled', lastHeartbeatAt: null, now })
        .notice,
    ).toBe('X-Plane stopped sending data.');
  });

  it('waits for the first values right after connecting', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'unknown', lastHeartbeatAt: null, now }),
    ).toEqual({
      valuesCurrent: false,
      controlsEnabled: false,
      notice: 'Waiting for the first values from X-Plane.',
    });
  });

  it('shows how old the values are while reconnecting', () => {
    expect(
      panelLinkStatus({
        state: 'reconnecting',
        activity: 'unknown',
        lastHeartbeatAt: now - 3_000,
        now,
      }),
    ).toEqual({
      valuesCurrent: false,
      controlsEnabled: false,
      notice: 'Reconnecting. Showing values from 3 s ago.',
    });
    expect(
      panelLinkStatus({ state: 'reconnecting', activity: 'unknown', lastHeartbeatAt: null, now })
        .notice,
    ).toBe('Reconnecting.');
  });

  it.each(['disconnected', 'error', 'connecting', 'pairing'] as const)(
    'shows the last known values when %s',
    (state) => {
      expect(
        panelLinkStatus({ state, activity: 'unknown', lastHeartbeatAt: now - 5_000, now }),
      ).toEqual({
        valuesCurrent: false,
        controlsEnabled: false,
        notice: 'Not connected. Showing the last known values.',
      });
    },
  );
});

describe('controlAvailability', () => {
  const feature = (
    status: FeatureAvailability['status'],
    missing: FeatureAvailability['missing'] = [],
  ): FeatureAvailability => ({ id: 'heading-control', label: 'Heading control', status, missing });

  it('lets available and partial features act', () => {
    expect(controlAvailability(feature('available'))).toEqual({ usable: true, reason: null });
    expect(controlAvailability(feature('partial'))).toEqual({ usable: true, reason: null });
  });

  it('says an unknown feature has not been checked, never that it is missing', () => {
    expect(controlAvailability(feature('unknown'))).toEqual({
      usable: false,
      reason: 'Heading control has not been checked yet.',
    });
  });

  it('names what an unavailable feature is missing, in the pilots words', () => {
    expect(
      controlAvailability(
        feature('unavailable', [
          { name: 'a', kind: 'dataref', purpose: 'Heading bug', status: 'missing' },
          { name: 'b', kind: 'command', purpose: 'Heading up control', status: 'missing' },
        ]),
      ),
    ).toEqual({
      usable: false,
      reason: 'Heading control is not available on this aircraft: Heading bug, Heading up control.',
    });
  });

  it('refuses a control whose feature the profile does not declare', () => {
    expect(controlAvailability(null)).toEqual({ usable: false, reason: NO_FEATURE_REASON });
  });
});

describe('shouldHoldScreenAwake', () => {
  const holding: ConnectionState[] = ['connected', 'reconnecting'];

  it.each(CONNECTION_STATES)('holds only while connected or reconnecting (%s)', (linkState) => {
    expect(shouldHoldScreenAwake({ foreground: true, linkState, onPanel: true })).toBe(
      holding.includes(linkState),
    );
  });

  it('releases in the background and on Setup', () => {
    expect(
      shouldHoldScreenAwake({ foreground: false, linkState: 'connected', onPanel: true }),
    ).toBe(false);
    expect(
      shouldHoldScreenAwake({ foreground: true, linkState: 'connected', onPanel: false }),
    ).toBe(false);
  });
});
