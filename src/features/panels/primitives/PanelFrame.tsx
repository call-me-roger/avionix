import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { panelLinkStatus } from '@/domain/panels/panel-link';
import {
  type PanelActions,
  PanelContext,
  type PanelContextValue,
  usePanel,
} from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  scroll: { flex: 1 },
  fill: { flex: 1, padding: theme.spacing.lg, gap: theme.touch.spacing },
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

/** The context's notice, rendered once so `link` is computed only inside PanelScope. */
function PanelNotice() {
  const styles = useThemedStyles(makeStyles);
  const { link } = usePanel();
  if (link.notice === null) {
    return null;
  }
  return (
    <View testID="panel-notice" style={styles.notice}>
      <BodyText>{link.notice}</BodyText>
    </View>
  );
}

/** The panel context without chrome: for read-only views that live outside a panel (the strip). */
export function PanelScope({
  snapshot,
  now,
  actions,
  children,
}: {
  snapshot: SessionSnapshot;
  now: number;
  actions: PanelActions;
  children: React.ReactNode;
}) {
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
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

/**
 * The chrome every panel sits in. It computes the link status once and publishes it with the
 * snapshot and the actions, so every Readout and ControlButton agrees, and it renders R7's single
 * explanation at the top — never one per control. `fillsFrame` (from the panel's descriptor) gives
 * the panel the fixed-height space under the title instead of a scroll view: the panel scrolls
 * its own parts, so a part it pins stays put.
 */
export function PanelFrame({
  title,
  snapshot,
  now,
  actions,
  fillsFrame = false,
  children,
}: {
  title: string;
  snapshot: SessionSnapshot;
  now: number;
  actions: PanelActions;
  fillsFrame?: boolean;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const heading = (
    <Text accessibilityRole="header" style={styles.title}>
      {title}
    </Text>
  );
  if (fillsFrame) {
    return (
      <PanelScope snapshot={snapshot} now={now} actions={actions}>
        <View testID="panel-frame" style={styles.fill}>
          {heading}
          <PanelNotice />
          {children}
        </View>
      </PanelScope>
    );
  }
  return (
    <PanelScope snapshot={snapshot} now={now} actions={actions}>
      <ScrollView
        testID="panel-frame"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // iOS: scroll a focused ValueEntry clear of the keyboard instead of leaving it under it.
        automaticallyAdjustKeyboardInsets
      >
        {heading}
        <PanelNotice />
        {children}
      </ScrollView>
    </PanelScope>
  );
}
