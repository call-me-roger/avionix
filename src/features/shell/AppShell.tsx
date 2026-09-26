import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useServices } from '@/app/services-context';
import { SETUP_ROUTE, resolveRoute } from '@/application/panel-layout';
import { panelFit } from '@/domain/panels/device-layout';
import { shouldHoldScreenAwake } from '@/domain/panels/keep-awake-policy';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { PANELS, type RegisteredPanel, findPanel } from '@/features/panels/registry';
import { PanelSwitcher } from '@/features/shell/PanelSwitcher';
import { SetupScreen } from '@/features/shell/SetupScreen';
import { useAppForeground } from '@/hooks/useAppForeground';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { usePanelLayout } from '@/hooks/usePanelLayout';
import { useScreenKeepAwake } from '@/hooks/useScreenKeepAwake';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  statusBarWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: 56 },
  body: { flex: 1 },
  row: { flexDirection: 'row' as const },
  column: { flexDirection: 'column' as const },
  content: { flex: 1 },
  fill: { flex: 1 },
  hidden: { display: 'none' as const },
  notice: { padding: theme.spacing.lg },
});

/**
 * The app's root under the providers (F-04). The link status bar never scrolls away; below it,
 * the active panel or Setup, and the switcher. Rotation only moves the switcher: the content is
 * a keyed child, so the panel, its state and a half-typed entry survive (R2).
 */
export function AppShell({ panels = PANELS }: { panels?: readonly RegisteredPanel[] }) {
  const { snapshot, write, activate, setDemand } = useSimulatorSession();
  const { settingsStorage } = useServices();
  const deviceLayout = useDeviceLayout();
  const panelIds = useMemo(() => panels.map((panel) => panel.descriptor.id), [panels]);
  const { layout, ready, setLast, setHidden } = usePanelLayout(settingsStorage, panelIds);
  const foreground = useAppForeground();
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const shown = panels.filter(
    (panel) =>
      !layout.hidden.includes(panel.descriptor.id) &&
      panelFit(panel.descriptor, deviceLayout) !== 'unsupported',
  );
  const route = resolveRoute(
    layout.last,
    shown.map((panel) => panel.descriptor.id),
  );
  const active = route === SETUP_ROUTE ? null : findPanel(panels, route);
  const fit = active === null ? null : panelFit(active.descriptor, deviceLayout);
  // A string key, so the effect below fires on a change of features, not of array identity.
  const demandKey = active !== null && fit === 'fits' ? active.descriptor.features.join('\n') : '';

  useEffect(() => {
    if (!ready) {
      return;
    }
    setDemand(demandKey === '' ? [] : demandKey.split('\n'));
  }, [ready, demandKey, setDemand]);

  useScreenKeepAwake(
    shouldHoldScreenAwake({ foreground, linkState: snapshot.state, onPanel: active !== null }),
  );

  // Not memoized: `route` is a plain per-render value, so a useCallback here would be
  // recreated on every route change anyway and gains nothing.
  const onStatusBarPress = () => {
    if (route === SETUP_ROUTE) {
      setShowDiagnostics((open) => !open);
      return;
    }
    setShowDiagnostics(true);
    setLast(SETUP_ROUTE);
  };

  const actions = useMemo(() => ({ write, activate }), [write, activate]);
  const landscape = deviceLayout.orientation === 'landscape';
  const switcher = (
    <PanelSwitcher
      key="switcher"
      items={[
        ...shown.map((panel) => ({ id: panel.descriptor.id, title: panel.descriptor.title })),
        { id: SETUP_ROUTE, title: 'Setup' },
      ]}
      route={route}
      orientation={deviceLayout.orientation}
      onSelect={setLast}
    />
  );

  return (
    <View testID="app-shell" style={styles.root}>
      <View style={styles.statusBarWrap}>
        <LinkStatusBar snapshot={snapshot} now={now} onOpenDiagnostics={onStatusBarPress} />
      </View>
      {ready ? (
        <View style={[styles.body, landscape ? styles.row : styles.column]}>
          {landscape ? switcher : null}
          <View key="content" style={styles.content}>
            {active === null ? (
              <SetupScreen
                snapshot={snapshot}
                now={now}
                showDiagnostics={showDiagnostics}
                panels={panels}
                panelIds={panelIds}
                layout={layout}
                deviceLayout={deviceLayout}
                onSetHidden={setHidden}
              />
            ) : (
              <>
                {fit === 'rotate' ? (
                  <View style={styles.notice}>
                    <BodyText>
                      {`Rotate the device to ${landscape ? 'portrait' : 'landscape'} to use this panel.`}
                    </BodyText>
                  </View>
                ) : null}
                <View
                  key={active.descriptor.id}
                  testID={`panel-${active.descriptor.id}`}
                  style={fit === 'fits' ? styles.fill : styles.hidden}
                >
                  <PanelFrame
                    title={active.descriptor.title}
                    snapshot={snapshot}
                    now={now}
                    actions={actions}
                  >
                    <active.Component />
                  </PanelFrame>
                </View>
              </>
            )}
          </View>
          {landscape ? null : switcher}
        </View>
      ) : null}
    </View>
  );
}
