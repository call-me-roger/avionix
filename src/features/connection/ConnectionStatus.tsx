import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const versions = snapshot.capabilities?.rawApiVersions.join(', ') ?? '-';
  const using = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Status</Text>
      <Text>Status: {snapshot.state}</Text>
      {snapshot.state === 'reconnecting' ? (
        <Text>Reconnect attempt: {snapshot.reconnectAttempt}</Text>
      ) : null}
      <Text>X-Plane version: {snapshot.capabilities?.simulatorVersion ?? '-'}</Text>
      <Text>
        API versions: {versions}
        {using}
      </Text>
      {snapshot.error !== null ? (
        <Text style={styles.error}>
          {snapshot.error.code}: {snapshot.error.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  error: { color: '#b00020', marginTop: 4 },
});
