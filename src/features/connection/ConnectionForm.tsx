import React, { useState } from 'react';
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
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Never rejects: a refused code arrives through the snapshot, not through this promise. */
  onPair: (code: string) => Promise<void>;
}

const CODE_LENGTH = 6;

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md },
});

/**
 * The code field and the Pair button, mounted only while the session is `pairing`. Both the
 * typed code and the in-flight flag live here, so they die with the pairing episode they
 * belong to: a cancelled attempt can neither leave six stale digits in the field nor leave
 * the button disabled for the next episode.
 */
function PairingFields(props: {
  connectorName: string | null;
  onPair: (code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    setBusy(true);
    void props.onPair(code).finally(() => {
      setBusy(false);
      // However it ended, the next attempt starts from an empty field. On success this
      // component is unmounted before either update is applied; React drops state updates
      // on an unmounted component without warning, so no mounted-ref guard is needed.
      setCode('');
    });
  };

  return (
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
        editable={!busy}
      />
      <View style={styles.row}>
        <Button
          title="Pair"
          onPress={submit}
          disabled={busy || code.length !== CODE_LENGTH}
          color={theme.colors.primary}
        />
        <Button title="Cancel" onPress={props.onCancel} color={theme.colors.primary} />
      </View>
    </>
  );
}

export function ConnectionForm(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isPairingState = props.state === 'pairing';
  const busy = props.state === 'connecting' || props.state === 'reconnecting' || isPairingState;
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
      {isPairingState ? (
        <PairingFields
          connectorName={props.connectorName}
          onPair={props.onPair}
          onCancel={props.onDisconnect}
        />
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
