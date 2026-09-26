import React, { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import type { PanelLayout } from '@/application/panel-layout';
import type { SessionSnapshot } from '@/application/session-snapshot';
import type { DiscoveredConnector } from '@/domain/discovery/discovered-connector';
import type { DeviceLayout } from '@/domain/panels/device-layout';
import { AircraftSummary } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import type { RegisteredPanel } from '@/features/panels/registry';
import { PanelChooser } from '@/features/shell/PanelChooser';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { isDiscoveryState, useConnectorDiscovery } from '@/hooks/useConnectorDiscovery';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: theme.spacing.lg, paddingTop: theme.spacing.md },
  heading: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    marginBottom: theme.spacing.md,
  },
});

export function SetupScreen(props: {
  snapshot: SessionSnapshot;
  now: number;
  showDiagnostics: boolean;
  panels: readonly RegisteredPanel[];
  panelIds: readonly string[];
  layout: PanelLayout;
  deviceLayout: DeviceLayout;
  onSetHidden: (id: string, hidden: boolean) => void;
}) {
  const { snapshot, now } = props;
  const { connect, disconnect, pair, recheckCompatibility } = useSimulatorSession();
  const settings = useConnectionSettings();
  const discovery = useConnectorDiscovery(snapshot.state);
  const styles = useThemedStyles(makeStyles);
  const [showCompatibility, setShowCompatibility] = useState(false);

  const onToggleCompatibility = useCallback(() => setShowCompatibility((open) => !open), []);
  const onRecheck = useCallback(() => void recheckCompatibility(), [recheckCompatibility]);
  const onConnect = useCallback(() => {
    void settings.persist();
    void connect(settings.host, settings.port);
  }, [connect, settings]);
  const onPair = useCallback(
    (code: string) =>
      pair(code).catch(() => {
        // pair() only rejects with INTERNAL (wrong state or a concurrent call), which the
        // disabled button already prevents; user-visible failures arrive via snapshot.error.
      }),
    [pair],
  );
  const onSelectConnector = useCallback(
    (connector: DiscoveredConnector) => {
      void settings.setConnection(connector.host, connector.port);
      void connect(connector.host, String(connector.port));
    },
    [connect, settings],
  );

  return (
    <ScrollView
      testID="setup-screen"
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Avionix</Text>
      <ConnectionForm
        host={settings.host}
        port={settings.port}
        state={snapshot.state}
        connectorName={snapshot.connector?.name ?? null}
        onHostChange={settings.setHost}
        onPortChange={settings.setPort}
        onConnect={onConnect}
        onDisconnect={disconnect}
        onPair={onPair}
      />
      <DiscoveredConnectors
        snapshot={discovery}
        enabled={isDiscoveryState(snapshot.state)}
        onSelect={onSelectConnector}
      />
      {props.showDiagnostics ? (
        <DiagnosticsScreen
          snapshot={snapshot}
          now={now}
          onRetry={onConnect}
          onDisconnect={disconnect}
        />
      ) : null}
      <AircraftSummary snapshot={snapshot} now={now} onOpenCompatibility={onToggleCompatibility} />
      {showCompatibility ? (
        <CompatibilityScreen snapshot={snapshot} now={now} onRecheck={onRecheck} />
      ) : null}
      <Section>
        <SectionTitle>Display</SectionTitle>
        <ThemeToggle />
      </Section>
      <PanelChooser
        panels={props.panels}
        panelIds={props.panelIds}
        layout={props.layout}
        deviceLayout={props.deviceLayout}
        onSetHidden={props.onSetHidden}
      />
    </ScrollView>
  );
}
