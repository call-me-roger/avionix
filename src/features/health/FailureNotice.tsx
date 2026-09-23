import React from 'react';

import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import { type ConnectStep, explainFailure } from '@/domain/health/failure-explanation';
import { BodyText } from '@/theme/primitives';

/**
 * The only route from an error to the screen. `AvionixError.message` is deliberately not a
 * prop: it carries URLs, HTTP statuses and exception text that F-02 R9 forbids showing.
 */
export function FailureNotice({
  code,
  step = null,
}: {
  code: AvionixErrorCode;
  step?: ConnectStep | null;
}) {
  const { cause, action } = explainFailure(code, step);
  return (
    <>
      <BodyText tone="danger">{cause}</BodyText>
      <BodyText muted>{action}</BodyText>
    </>
  );
}
