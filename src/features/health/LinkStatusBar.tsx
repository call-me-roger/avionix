import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';
import { BodyText } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { numeric } from '@/theme/typography';

export const LINK_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  pairing: 'Waiting for the pairing code',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection failed',
};

export type LampState = 'live' | 'notLive' | 'down';

/**
 * The lamp's shape and colour both carry the state, never colour alone (spec section 4):
 * a filled circle when live, a hollow ring while connected-but-stale (or getting there), and a
 * plain ✕ once the link itself is down.
 */
export function statusLamp(state: ConnectionState, live: boolean): LampState {
  if (state === 'connected') {
    return live ? 'live' : 'notLive';
  }
  if (state === 'connecting' || state === 'pairing' || state === 'reconnecting') {
    return 'notLive';
  }
  return 'down';
}

const makeStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    // F-04 R4: every pressable target is at least 48 dp in both directions.
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  lamp: { width: 12, height: 12 },
  lampLive: { borderRadius: 6, backgroundColor: theme.colors.success },
  lampNotLive: { borderRadius: 6, borderWidth: 2, borderColor: theme.colors.caution },
  lampDown: {
    width: 12,
    textAlign: 'center' as const,
    color: theme.colors.danger,
    fontWeight: 'bold' as const,
    fontSize: 14,
  },
  text: { flex: 1 },
});

function Lamp({ lamp }: { lamp: LampState }) {
  const styles = useThemedStyles(makeStyles);
  const testID = `status-lamp-${lamp}`;
  if (lamp === 'down') {
    return (
      <Text testID={testID} style={styles.lampDown}>
        ✕
      </Text>
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.lamp, lamp === 'live' ? styles.lampLive : styles.lampNotLive]}
    />
  );
}

/** The single text line: the retry count while reconnecting, liveness once connected, or the
 * plain link label otherwise. */
function lineText(snapshot: SessionSnapshot): string {
  const { state, health } = snapshot;
  if (state === 'reconnecting') {
    return `Reconnecting · attempt ${snapshot.reconnectAttempt} of ${health.reconnectBudget}`;
  }
  if (state === 'connected') {
    return `${LINK_LABEL.connected} · ${health.live ? 'Live' : ACTIVITY_LABEL[health.activity]}`;
  }
  return LINK_LABEL[state];
}

/**
 * Always on screen, pinned above whatever panel or Setup is in front (AppShell). One compact row
 * (R-01): a status lamp, one text line and, only while not live, the age — a live bar needs no
 * age, which is the dark-cockpit principle of staying quiet while normal. Never connected, there
 * is no age at all.
 */
export function LinkStatusBar({
  snapshot,
  now,
  onOpenDiagnostics,
  safeArea,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpenDiagnostics: () => void;
  /** The system-area inset on each side, kept as padding on the bar now that it spans edge to edge. */
  safeArea?: { left?: number; right?: number };
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { health, state } = snapshot;
  // Never connected, there is no age to give: "updated no data yet" says nothing the lamp does not.
  const age =
    health.lastHeartbeatAt === null ? null : formatAge(ageMs(health.lastHeartbeatAt, now));
  const ageLabel = age === null ? '' : `, updated ${age}`;
  const liveness = health.live ? 'Live' : 'Not live';
  const activity = ACTIVITY_LABEL[health.activity];
  const retry =
    state === 'reconnecting'
      ? `Reconnecting, attempt ${snapshot.reconnectAttempt} of ${health.reconnectBudget}`
      : null;
  // The Pressable's accessibilityLabel collapses the whole subtree to one announced string, so
  // the retry line rendered below as a sibling BodyText is invisible to a screen reader unless
  // it is folded into the label too.
  const retryLabelSuffix = retry === null ? '' : ` ${retry}.`;
  const lamp = statusLamp(state, health.live);

  return (
    <Pressable
      testID="link-status-bar"
      accessibilityRole="button"
      accessibilityLabel={`${LINK_LABEL[state]}. ${activity}. Values ${liveness.toLowerCase()}${ageLabel}.${retryLabelSuffix} Open diagnostics.`}
      onPress={onOpenDiagnostics}
      style={[
        styles.bar,
        {
          paddingLeft: (safeArea?.left ?? 0) + theme.spacing.lg,
          paddingRight: (safeArea?.right ?? 0) + theme.spacing.lg,
        },
      ]}
    >
      <Lamp lamp={lamp} />
      <View style={styles.text}>
        <BodyText>{lineText(snapshot)}</BodyText>
      </View>
      {lamp === 'live' || age === null ? null : (
        <BodyText muted style={numeric(theme)}>{`updated ${age}`}</BodyText>
      )}
    </Pressable>
  );
}
