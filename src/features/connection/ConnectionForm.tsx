import React from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';

interface Props {
  host: string;
  port: string;
  state: ConnectionState;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectionForm(props: Props) {
  const busy = props.state === 'connecting' || props.state === 'reconnecting';
  const connected = props.state === 'connected' || busy;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Connection</Text>
      <Text>X-Plane host (IP or hostname on your LAN)</Text>
      <TextInput
        accessibilityLabel="X-Plane host"
        style={styles.input}
        value={props.host}
        onChangeText={props.onHostChange}
        placeholder="192.168.1.100"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!connected}
      />
      <Text>Port</Text>
      <TextInput
        accessibilityLabel="Port"
        style={styles.input}
        value={props.port}
        onChangeText={props.onPortChange}
        keyboardType="number-pad"
        editable={!connected}
      />
      <View style={styles.row}>
        <Button title="Connect" onPress={props.onConnect} disabled={connected} />
        <Button
          title="Disconnect"
          onPress={props.onDisconnect}
          disabled={props.state === 'disconnected'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#888', padding: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
});
