import React from 'react';
import { Button, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  host: string;
  port: string;
  state: ConnectionState;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md },
});

export function ConnectionForm(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const busy = props.state === 'connecting' || props.state === 'reconnecting';
  const connected = props.state === 'connected' || busy;
  return (
    <Section>
      <SectionTitle>Connection</SectionTitle>
      <BodyText>X-Plane host (IP or hostname on your LAN)</BodyText>
      <ThemedTextInput
        accessibilityLabel="X-Plane host"
        value={props.host}
        onChangeText={props.onHostChange}
        placeholder="192.168.1.100"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!connected}
      />
      <BodyText>Port</BodyText>
      <ThemedTextInput
        accessibilityLabel="Port"
        value={props.port}
        onChangeText={props.onPortChange}
        keyboardType="number-pad"
        editable={!connected}
      />
      <View style={styles.row}>
        <Button
          title="Connect"
          onPress={props.onConnect}
          disabled={connected}
          color={theme.colors.primary}
        />
        <Button
          title="Disconnect"
          onPress={props.onDisconnect}
          disabled={props.state === 'disconnected'}
          color={theme.colors.primary}
        />
      </View>
    </Section>
  );
}
