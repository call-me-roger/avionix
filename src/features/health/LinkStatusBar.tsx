import React from 'react';
import { Pressable, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export const LINK_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  pairing: 'Waiting for the pairing code',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection failed',
};

const makeStyles = (theme: Theme) => ({
  bar: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    // F-04 R4: every pressable target is at least 48 dp in both directions.
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    gap: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
});

/** Always on screen, pinned above whatever panel or Setup is in front (AppShell). */
export function LinkStatusBar({
  snapshot,
  now,
  onOpenDiagnostics,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpenDiagnostics: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { health, state } = snapshot;
  const age = formatAge(ageMs(health.lastHeartbeatAt, now));
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

  return (
    <Pressable
      testID="link-status-bar"
      accessibilityRole="button"
      accessibilityLabel={`${LINK_LABEL[state]}. ${activity}. Values ${liveness.toLowerCase()}, updated ${age}.${retryLabelSuffix} Open diagnostics.`}
      onPress={onOpenDiagnostics}
      style={styles.bar}
    >
      <View style={styles.row}>
        <BodyText>{LINK_LABEL[state]}</BodyText>
        <BodyText tone={health.live ? 'success' : 'danger'}>{liveness}</BodyText>
      </View>
      <View style={styles.row}>
        <BodyText muted>{activity}</BodyText>
        <BodyText muted>{age}</BodyText>
      </View>
      {retry === null ? null : <BodyText muted>{retry}</BodyText>}
    </Pressable>
  );
}
