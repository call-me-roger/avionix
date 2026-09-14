import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';

function label(status: StepStatus): string {
  switch (status) {
    case 'ok':
      return 'YES';
    case 'failed':
      return 'NO';
    case 'pending':
      return '...';
    case 'idle':
      return '-';
  }
}

export function DiagnosticsPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  const d = snapshot.diagnostics;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Diagnostics</Text>
      <Text>
        Target: {snapshot.config === null ? '-' : `${snapshot.config.host}:${snapshot.config.port}`}
      </Text>
      <Text>HTTP: {label(d.http)}</Text>
      <Text>Capabilities: {label(d.capabilities)}</Text>
      <Text>WebSocket: {label(d.websocket)}</Text>
      {Object.entries(d.dataRefs).map(([name, status]) => (
        <Text key={name}>
          DataRef {name}: {label(status)}
        </Text>
      ))}
      <Text>Command: {label(d.command)}</Text>
      <Text>Subscription: {label(d.subscription)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
});
