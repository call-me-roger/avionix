import React from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

/** Codes the user can act on get plain language; everything else keeps `code: message`. */
const PLAIN_TEXT: Partial<Record<AvionixErrorCode, string>> = {
  PAIRING_FAILED: 'Wrong code, check the connector window.',
  PAIRING_RATE_LIMITED: 'Too many attempts, wait a minute and try again.',
  UNAUTHORIZED: 'The connector no longer accepts this device, pair again.',
  PAIRING_REQUIRED: 'This connector needs pairing.',
};

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const versions = snapshot.capabilities?.rawApiVersions.join(', ') ?? '-';
  const using = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;
  const error = snapshot.error;
  return (
    <Section>
      <SectionTitle>Status</SectionTitle>
      <BodyText>Status: {snapshot.state}</BodyText>
      {snapshot.state === 'reconnecting' ? (
        <BodyText>Reconnect attempt: {snapshot.reconnectAttempt}</BodyText>
      ) : null}
      {snapshot.connector === null ? null : (
        <BodyText>Connector: {snapshot.connector.name}</BodyText>
      )}
      <BodyText>X-Plane version: {snapshot.capabilities?.simulatorVersion ?? '-'}</BodyText>
      <BodyText>
        API versions: {versions}
        {using}
      </BodyText>
      {error !== null ? (
        <BodyText tone="danger">
          {PLAIN_TEXT[error.code] ?? `${error.code}: ${error.message}`}
        </BodyText>
      ) : null}
    </Section>
  );
}
