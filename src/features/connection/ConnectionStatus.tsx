import React from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const versions = snapshot.capabilities?.rawApiVersions.join(', ') ?? '-';
  const using = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;
  return (
    <Section>
      <SectionTitle>Status</SectionTitle>
      <BodyText>Status: {snapshot.state}</BodyText>
      {snapshot.state === 'reconnecting' ? (
        <BodyText>Reconnect attempt: {snapshot.reconnectAttempt}</BodyText>
      ) : null}
      <BodyText>X-Plane version: {snapshot.capabilities?.simulatorVersion ?? '-'}</BodyText>
      <BodyText>
        API versions: {versions}
        {using}
      </BodyText>
      {snapshot.error !== null ? (
        <BodyText tone="danger">
          {snapshot.error.code}: {snapshot.error.message}
        </BodyText>
      ) : null}
    </Section>
  );
}
