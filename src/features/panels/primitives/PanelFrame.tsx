import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { panelLinkStatus } from '@/domain/panels/panel-link';
import {
  type PanelActions,
  PanelContext,
  type PanelContextValue,
} from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg, gap: theme.touch.spacing },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
  },
  notice: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});

/**
 * The chrome every panel sits in. It computes the link status once and publishes it with the
 * snapshot and the actions, so every Readout and ControlButton agrees, and it renders R7's single
 * explanation at the top — never one per control.
 */
export function PanelFrame({
  title,
  snapshot,
  now,
  actions,
  children,
}: {
  title: string;
  snapshot: SessionSnapshot;
  now: number;
  actions: PanelActions;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const { valuesCurrent, controlsEnabled, notice } = panelLinkStatus({
    state: snapshot.state,
    activity: snapshot.health.activity,
    lastHeartbeatAt: snapshot.health.lastHeartbeatAt,
    now,
  });
  const value = useMemo<PanelContextValue>(
    () => ({
      snapshot,
      now,
      link: { valuesCurrent, controlsEnabled, notice },
      write: actions.write,
      activate: actions.activate,
    }),
    [snapshot, now, valuesCurrent, controlsEnabled, notice, actions.write, actions.activate],
  );
  return (
    <PanelContext.Provider value={value}>
      <ScrollView
        testID="panel-frame"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // iOS: scroll a focused ValueEntry clear of the keyboard instead of leaving it under it.
        automaticallyAdjustKeyboardInsets
      >
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {notice === null ? null : (
          <View testID="panel-notice" style={styles.notice}>
            <BodyText>{notice}</BodyText>
          </View>
        )}
        {children}
      </ScrollView>
    </PanelContext.Provider>
  );
}
