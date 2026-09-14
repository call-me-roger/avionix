import type { ApiVersion } from '@/domain/simulator/api-version';

export interface SimulatorCapabilities {
  simulatorVersion: string;
  supportedApiVersions: ApiVersion[];
  rawApiVersions: string[];
}

export type DataRefValueType = 'float' | 'double' | 'int' | 'int_array' | 'float_array' | 'data';

export const DATAREF_VALUE_TYPES: readonly DataRefValueType[] = [
  'float',
  'double',
  'int',
  'int_array',
  'float_array',
  'data',
];

export interface DataRefDescriptor {
  id: number;
  name: string;
  valueType: DataRefValueType;
}

export interface CommandDescriptor {
  id: number;
  name: string;
  description: string;
}

/** Scalar, array, or base64 string (value_type "data"). */
export type DataRefValue = number | number[] | string;

export interface DataRefSubscription {
  id: number;
  index?: number | number[];
}

export interface DataRefUpdate {
  id: number;
  value: DataRefValue;
  receivedAt: number;
}
