import React, { useEffect, useRef, useState } from 'react';
import { Button, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  host: string;
  port: string;
  state: ConnectionState;
  connectorName: string | null;
  pairing: boolean;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onPair: (code: string) => void;
}

const CODE_LENGTH = 6;

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md },
});

export function ConnectionForm(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [code, setCode] = useState('');
  const wasPairing = useRef(false);
  const isPairingState = props.state === 'pairing';
  const busy = props.state === 'connecting' || props.state === 'reconnecting' || isPairingState;
  const connected = props.state === 'connected' || busy;

  // A pair call that ends while the session is still `pairing` was rejected: start over with
  // an empty field so the user does not have to clear six digits by hand.
  useEffect(() => {
    if (wasPairing.current && !props.pairing && isPairingState) {
      setCode('');
    }
    wasPairing.current = props.pairing;
  }, [props.pairing, isPairingState]);

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
      {isPairingState ? (
        <>
          <BodyText>
            {props.connectorName ?? 'This connector'} needs pairing. Enter the code shown in the
            connector window.
          </BodyText>
          <ThemedTextInput
            testID="pairing-code"
            accessibilityLabel="Pairing code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
            editable={!props.pairing}
          />
          <View style={styles.row}>
            <Button
              title="Pair"
              onPress={() => props.onPair(code)}
              disabled={props.pairing || code.length !== CODE_LENGTH}
              color={theme.colors.primary}
            />
            <Button title="Cancel" onPress={props.onDisconnect} color={theme.colors.primary} />
          </View>
        </>
      ) : (
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
      )}
    </Section>
  );
}
