import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { ConnectionStatus } from '@/features/connection/ConnectionStatus';
import { DiagnosticsPanel } from '@/features/diagnostics/DiagnosticsPanel';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { TelemetryPanel } from '@/features/mvp/TelemetryPanel';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';

export function MvpScreen() {
  const { snapshot, connect, disconnect, writeHeading, activateHeadingUp } = useSimulatorSession();
  const settings = useConnectionSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const onConnect = useCallback(() => {
    void settings.persist();
    void connect(settings.host, settings.port);
  }, [connect, settings]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Avionix</Text>
      <ConnectionForm
        host={settings.host}
        port={settings.port}
        state={snapshot.state}
        onHostChange={settings.setHost}
        onPortChange={settings.setPort}
        onConnect={onConnect}
        onDisconnect={disconnect}
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

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 56 },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
});
