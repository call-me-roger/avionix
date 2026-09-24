import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import { FEATURE_HEADING_CONTROL } from '@/domain/aircraft/profiles/generic';
import type { DiscoveredConnector } from '@/domain/discovery/discovered-connector';
import { AircraftSummary } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { TelemetryPanel } from '@/features/mvp/TelemetryPanel';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { isDiscoveryState, useConnectorDiscovery } from '@/hooks/useConnectorDiscovery';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  statusBarWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: 56 },
  container: { padding: theme.spacing.lg, paddingTop: theme.spacing.md },
  heading: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    marginBottom: theme.spacing.md,
  },
});

export function MvpScreen() {
  const {
    snapshot,
    connect,
    disconnect,
    pair,
    writeHeading,
    activateHeadingUp,
    recheckCompatibility,
  } = useSimulatorSession();
  const settings = useConnectionSettings();
  const discovery = useConnectorDiscovery(snapshot.state);
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showCompatibility, setShowCompatibility] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const onToggleDiagnostics = useCallback(() => setShowDiagnostics((open) => !open), []);
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
    <View style={styles.root}>
      {/*
       * Outside the ScrollView, deliberately: this is the one panel that must never scroll out
       * of view, since it is what tells the pilot the telemetry below has gone stale.
       */}
      <View style={styles.statusBarWrap}>
        <LinkStatusBar snapshot={snapshot} now={now} onOpenDiagnostics={onToggleDiagnostics} />
      </View>
      <ScrollView
        testID="mvp-screen"
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Avionix</Text>
        <ThemeToggle />
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
        {showDiagnostics ? (
          <DiagnosticsScreen
            snapshot={snapshot}
            now={now}
            onRetry={onConnect}
            onDisconnect={disconnect}
          />
        ) : null}
        <AircraftSummary
          snapshot={snapshot}
          now={now}
          onOpenCompatibility={onToggleCompatibility}
        />
        {showCompatibility ? (
          <CompatibilityScreen snapshot={snapshot} now={now} onRecheck={onRecheck} />
        ) : null}
        <TelemetryPanel snapshot={snapshot} now={now} />
        <ControlPanel
          enabled={snapshot.state === 'connected'}
          feature={featureOf(snapshot.compatibility, FEATURE_HEADING_CONTROL)}
          lastOperation={snapshot.lastOperation}
          onWriteHeading={(value) => void writeHeading(value)}
          onHeadingUp={() => void activateHeadingUp()}
        />
      </ScrollView>
    </View>
  );
}
