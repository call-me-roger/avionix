import type { AvionixErrorCode } from '@/domain/errors/avionix-error';

/**
 * Where a failure happened, as the pilot would describe it. This is a presentation concept,
 * not a second copy of `SessionDiagnostics`: `resolution` covers the whole DataRef map and
 * `operation` covers a failed write or command activation.
 */
export type ConnectStep =
  | 'connector'
  | 'pairing'
  | 'http'
  | 'capabilities'
  | 'websocket'
  | 'resolution'
  | 'command'
  | 'subscription'
  | 'operation';

export const CONNECT_STEPS: readonly ConnectStep[] = [
  'connector',
  'pairing',
  'http',
  'capabilities',
  'websocket',
  'resolution',
  'command',
  'subscription',
  'operation',
];

export interface FailureExplanation {
  /** One line naming what went wrong, in the pilot's terms. */
  cause: string;
  /** One line naming what to do about it. */
  action: string;
}

const CHECK_NETWORK =
  'Check the PC is awake and on the same Wi-Fi, and that no VPN is active on either device.';

/**
 * Every code in the union has an entry. There is deliberately no fallback string: a new code
 * must be given real copy, and the exhaustive test is what enforces that.
 */
const BY_CODE: Record<AvionixErrorCode, FailureExplanation> = {
  INVALID_HOST: {
    cause: 'That address is not valid.',
    action:
      'Pick the connector from the discovered list, or check the address in the connector window.',
  },
  INVALID_PORT: {
    cause: 'That port number is not valid.',
    action:
      'Pick the connector from the discovered list, or check the port in the connector window.',
  },
  NETWORK_ERROR: { cause: 'Avionix could not reach the PC.', action: CHECK_NETWORK },
  TIMEOUT: { cause: 'The PC did not answer in time.', action: CHECK_NETWORK },
  HTTP_ERROR: {
    cause: 'X-Plane refused the request.',
    action: 'Restart X-Plane, then connect again.',
  },
  INCOMING_TRAFFIC_DISABLED: {
    cause: 'X-Plane is not accepting network connections.',
    action:
      'In X-Plane open Settings, then Network, and tick "Accept incoming connections". Then retry.',
  },
  PAIRING_REQUIRED: {
    cause: 'This connector needs to be paired with this device first.',
    action: 'Enter the six-digit code shown in the connector window.',
  },
  PAIRING_FAILED: {
    cause: 'That code was not accepted.',
    action: 'Check the code in the connector window and enter it again.',
  },
  PAIRING_RATE_LIMITED: {
    cause: 'Too many pairing attempts.',
    action: 'Wait a minute, then enter the code again.',
  },
  UNAUTHORIZED: {
    cause: 'The connector no longer accepts this device.',
    action: 'Pair again with a fresh code from the connector window.',
  },
  DISCOVERY_ERROR: {
    cause: 'Avionix could not search the network for connectors.',
    action:
      'Enter the address from the connector window by hand, or allow local network access for Avionix.',
  },
  UNSUPPORTED_API: {
    cause: 'This copy of X-Plane is older than Avionix supports.',
    action: 'Update X-Plane to 12.1.4 or newer, then connect again.',
  },
  INVALID_RESPONSE: {
    cause: 'X-Plane answered in a way Avionix did not understand.',
    action: 'Check that X-Plane and Avionix are both up to date, then connect again.',
  },
  WEBSOCKET_ERROR: {
    cause: 'The live data connection dropped.',
    action: CHECK_NETWORK,
  },
  DATAREF_NOT_FOUND: {
    cause: 'A value this panel needs is not available on the loaded aircraft.',
    action: 'Try a default aircraft to confirm, and report the aircraft you were flying.',
  },
  COMMAND_NOT_FOUND: {
    cause: 'A control this panel needs is not available on the loaded aircraft.',
    action: 'Try a default aircraft to confirm, and report the aircraft you were flying.',
  },
  DATAREF_READONLY: {
    cause: 'This aircraft does not allow that value to be changed.',
    action: 'Set it in the simulator instead.',
  },
  SUBSCRIPTION_FAILED: {
    cause: 'X-Plane accepted the connection but would not start sending values.',
    action: 'Restart X-Plane, then connect again.',
  },
  WRITE_FAILED: {
    cause: 'The change did not reach the aircraft.',
    action: 'Check the link is live, then try again.',
  },
  COMMAND_FAILED: {
    cause: 'The control press did not reach the aircraft.',
    action: 'Check the link is live, then try again.',
  },
  SIMULATOR_ERROR: {
    cause: 'X-Plane reported a problem with the request.',
    action: 'Restart X-Plane, then connect again.',
  },
  SIMULATOR_NOT_READY: {
    cause: 'X-Plane is running but has no flight loaded.',
    action: 'Start a flight in X-Plane. Avionix will pick it up on its own.',
  },
  CANCELLED: {
    cause: 'The request was cancelled.',
    action: 'Try again.',
  },
  INTERNAL: {
    cause: 'Avionix hit a problem of its own.',
    action: 'Share these diagnostics so the problem can be fixed.',
  },
  UNKNOWN: {
    cause: 'Something went wrong that Avionix could not identify.',
    action: 'Share these diagnostics so the problem can be fixed.',
  },
};

/** Overrides applied when the step changes the advice. */
const BY_STEP: Partial<Record<ConnectStep, Partial<Record<AvionixErrorCode, FailureExplanation>>>> =
  {
    connector: {
      NETWORK_ERROR: { cause: 'Avionix could not reach that address.', action: CHECK_NETWORK },
      TIMEOUT: { cause: 'That address did not answer in time.', action: CHECK_NETWORK },
    },
    capabilities: {
      HTTP_ERROR: {
        cause: 'X-Plane is reachable but refused to describe itself.',
        action: 'Update X-Plane to 12.1.4 or newer, then connect again.',
      },
    },
    resolution: {
      DATAREF_NOT_FOUND: {
        cause: 'A value Avionix needs is not published by the loaded aircraft.',
        action: 'Try a default aircraft to confirm, and report the aircraft you were flying.',
      },
    },
    operation: {
      TIMEOUT: {
        cause: 'The aircraft did not confirm the change in time.',
        action: 'Check the link is live, then try again.',
      },
    },
  };

export function explainFailure(
  code: AvionixErrorCode,
  step: ConnectStep | null,
): FailureExplanation {
  const override = step === null ? undefined : BY_STEP[step]?.[code];
  return override ?? BY_CODE[code];
}
