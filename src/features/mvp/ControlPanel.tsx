import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LastOperation } from '@/application/session-snapshot';

interface Props {
  enabled: boolean;
  lastOperation: LastOperation | null;
  onWriteHeading: (value: number) => void;
  onHeadingUp: () => void;
}

export function ControlPanel(props: Props) {
  const [heading, setHeading] = useState('90');
  const parsed = Number(heading);
  const canWrite = props.enabled && heading.trim() !== '' && Number.isFinite(parsed);
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Test controls</Text>
      <Text>Heading bug to write (0-360)</Text>
      <TextInput
        accessibilityLabel="Heading to write"
        style={styles.input}
        value={heading}
        onChangeText={setHeading}
        keyboardType="numeric"
      />
      <View style={styles.row}>
        <Button
          title="Write heading"
          onPress={() => props.onWriteHeading(parsed)}
          disabled={!canWrite}
        />
        <Button title="Heading up" onPress={props.onHeadingUp} disabled={!props.enabled} />
      </View>
      <Text>
        Last operation:{' '}
        {props.lastOperation === null
          ? '-'
          : `${props.lastOperation.ok ? 'OK' : 'FAILED'} ${props.lastOperation.message}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#888', padding: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 8 },
});
