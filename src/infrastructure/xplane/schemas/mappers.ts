import type { ZodType } from 'zod';

import { AvionixError } from '@/domain/errors/avionix-error';
import { isApiVersion } from '@/domain/simulator/api-version';
import type {
  CommandDescriptor,
  DataRefDescriptor,
  DataRefUpdate,
  DataRefValue,
  SimulatorCapabilities,
} from '@/domain/simulator/types';
import type { RawCapabilities, RawCommand, RawDataRef } from '@/infrastructure/xplane/schemas/rest';

export function parseWith<T>(schema: ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
  throw new AvionixError({
    code: 'INVALID_RESPONSE',
    message: `Unexpected ${context} payload from X-Plane (${detail})`,
    cause: result.error,
  });
}

export function toSimulatorCapabilities(raw: RawCapabilities): SimulatorCapabilities {
  return {
    simulatorVersion: raw['x-plane'].version,
    supportedApiVersions: raw.api.versions.filter(isApiVersion),
    rawApiVersions: [...raw.api.versions],
  };
}

export function toDataRefDescriptor(raw: RawDataRef): DataRefDescriptor {
  return { id: raw.id, name: raw.name, valueType: raw.value_type };
}

export function toCommandDescriptor(raw: RawCommand): CommandDescriptor {
  return { id: raw.id, name: raw.name, description: raw.description ?? '' };
}

export function toDataRefUpdates(
  data: Record<string, DataRefValue>,
  receivedAt: number,
): DataRefUpdate[] {
  const updates: DataRefUpdate[] = [];
  for (const [key, value] of Object.entries(data)) {
    const trimmed = key.trim();
    if (!/^\d+$/.test(trimmed)) {
      continue;
    }
    updates.push({ id: Number(trimmed), value, receivedAt });
  }
  return updates;
}
