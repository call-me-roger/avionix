import React from 'react';

import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

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

function tone(status: StepStatus): 'danger' | 'success' | undefined {
  if (status === 'ok') {
    return 'success';
  }
  if (status === 'failed') {
    return 'danger';
  }
  return undefined;
}

export function DiagnosticsPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  const d = snapshot.diagnostics;
  return (
    <Section>
      <SectionTitle>Diagnostics</SectionTitle>
      <BodyText>
        Target: {snapshot.config === null ? '-' : `${snapshot.config.host}:${snapshot.config.port}`}
      </BodyText>
      <BodyText tone={tone(d.http)}>HTTP: {label(d.http)}</BodyText>
      <BodyText tone={tone(d.capabilities)}>Capabilities: {label(d.capabilities)}</BodyText>
      <BodyText tone={tone(d.websocket)}>WebSocket: {label(d.websocket)}</BodyText>
      {Object.entries(d.dataRefs).map(([name, status]) => (
        <BodyText key={name} tone={tone(status)}>
          DataRef {name}: {label(status)}
        </BodyText>
      ))}
      <BodyText tone={tone(d.command)}>Command: {label(d.command)}</BodyText>
      <BodyText tone={tone(d.subscription)}>Subscription: {label(d.subscription)}</BodyText>
    </Section>
  );
}
