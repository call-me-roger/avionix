import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { ConnectionStatus } from '@/features/connection/ConnectionStatus';
import { DiagnosticsPanel } from '@/features/diagnostics/DiagnosticsPanel';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { TelemetryPanel } from '@/features/mvp/TelemetryPanel';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: theme.spacing.lg, paddingTop: 56 },
  heading: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    marginBottom: theme.spacing.md,
  },
});

export function MvpScreen() {
  const { snapshot, connect, disconnect, pair, writeHeading, activateHeadingUp } =
    useSimulatorSession();
  const settings = useConnectionSettings();
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  return (
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
      <ConnectionStatus snapshot={snapshot} />
      <DiagnosticsPanel snapshot={snapshot} />
      <TelemetryPanel snapshot={snapshot} now={now} />
      <ControlPanel
        enabled={snapshot.state === 'connected'}
        lastOperation={snapshot.lastOperation}
        onWriteHeading={(value) => void writeHeading(value)}
        onHeadingUp={() => void activateHeadingUp()}
      />
    </ScrollView>
  );
}
