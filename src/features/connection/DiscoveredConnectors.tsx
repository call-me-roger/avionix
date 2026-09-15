import React from 'react';
import { Pressable, Text } from 'react-native';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import type { DiscoveredConnector } from '@/domain/discovery/discovered-connector';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  snapshot: DiscoverySnapshot;
  /** True while the session is `disconnected` or `error`: the only states where a tap can act. */
  enabled: boolean;
  onSelect: (connector: DiscoveredConnector) => void;
}

const makeStyles = (theme: Theme) => ({
  row: {
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowPressed: { opacity: 0.6 },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.bodySize,
    fontWeight: 'bold' as const,
  },
});

function tagFor(connector: DiscoveredConnector): string | null {
  if (connector.pairingRequired === null) {
    return null;
  }
  return connector.pairingRequired ? 'Needs pairing' : 'Open';
}

export function DiscoveredConnectors({ snapshot, enabled, onSelect }: Props) {
  const styles = useThemedStyles(makeStyles);
  if (!enabled || snapshot.availability === 'unsupported') {
    return null;
  }
  const empty = snapshot.connectors.length === 0;
  return (
    <Section testID="discovered-connectors">
      <SectionTitle>Connectors on this network</SectionTitle>
      {snapshot.availability === 'needsDevBuild' ? (
        <BodyText muted>Connector discovery needs the Avionix development build.</BodyText>
      ) : (
        <>
          {snapshot.connectors.map((connector) => {
            const tag = tagFor(connector);
            return (
              <Pressable
                key={connector.name}
                testID={`discovered-${connector.name}`}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${connector.name}`}
                onPress={() => onSelect(connector)}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              >
                <Text style={styles.name}>{connector.name}</Text>
                <BodyText muted>{`${connector.host}:${connector.port}`}</BodyText>
                {tag === null ? null : <BodyText muted>{tag}</BodyText>}
              </Pressable>
            );
          })}
          {empty && snapshot.scanning ? <BodyText muted>Looking for connectors…</BodyText> : null}
          {empty && !snapshot.scanning && snapshot.error === null ? (
            <BodyText muted>No connectors found yet.</BodyText>
          ) : null}
          {snapshot.error === null ? null : (
            <BodyText tone="danger">{`Discovery failed: ${snapshot.error.message}`}</BodyText>
          )}
        </>
      )}
    </Section>
  );
}
