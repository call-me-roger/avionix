import { isAvionixError } from '@/domain/errors/avionix-error';
import {
  parseWith,
  toCommandDescriptor,
  toDataRefDescriptor,
  toSimulatorCapabilities,
} from '@/infrastructure/xplane/schemas/mappers';
import {
  capabilitiesResponseSchema,
  commandSchema,
  countResponseSchema,
  dataRefListResponseSchema,
  dataRefSchema,
  dataRefValueResponseSchema,
  errorPayloadSchema,
} from '@/infrastructure/xplane/schemas/rest';
import capabilitiesFixture from '../fixtures/capabilities.json';
import commandFixture from '../fixtures/command.json';
import dataRefListFixture from '../fixtures/dataref-list.json';
import dataRefFixture from '../fixtures/dataref.json';
import errorFixture from '../fixtures/error.json';

describe('capabilities contract', () => {
  it('parses the documented payload and maps to SimulatorCapabilities', () => {
    const raw = parseWith(capabilitiesResponseSchema, capabilitiesFixture, 'capabilities');
    expect(toSimulatorCapabilities(raw)).toEqual({
      simulatorVersion: '12.4.0',
      supportedApiVersions: ['v1', 'v2', 'v3'],
      rawApiVersions: ['v1', 'v2', 'v3'],
    });
  });

  it('keeps unknown versions in rawApiVersions but not in supportedApiVersions', () => {
    const raw = parseWith(
      capabilitiesResponseSchema,
      { api: { versions: ['v2', 'v3', 'v4'] }, 'x-plane': { version: '13.0.0' } },
      'capabilities',
    );
    expect(toSimulatorCapabilities(raw)).toEqual({
      simulatorVersion: '13.0.0',
      supportedApiVersions: ['v2', 'v3'],
      rawApiVersions: ['v2', 'v3', 'v4'],
    });
  });

  it.each([
    [{ api: { versions: 'v3' }, 'x-plane': { version: '12.4.0' } }, 'versions not an array'],
    [{ api: { versions: ['v3'] } }, 'missing x-plane'],
    [{ api: { versions: ['v3'] }, 'x-plane': { version: 12 } }, 'version not a string'],
    [null, 'null'],
    ['text', 'string'],
  ])('rejects %j (%s) with INVALID_RESPONSE', (payload, _description) => {
    try {
      parseWith(capabilitiesResponseSchema, payload, 'capabilities');
      throw new Error('expected throw');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('INVALID_RESPONSE');
      expect(isAvionixError(error) && error.message).toContain('capabilities');
    }
  });
});

describe('dataref contract', () => {
  it('parses the documented dataref and maps to DataRefDescriptor', () => {
    const raw = parseWith(dataRefSchema, dataRefFixture, 'dataref');
    expect(toDataRefDescriptor(raw)).toEqual({
      id: 9952311,
      name: 'sim/cockpit2/gauges/actuators/radio_altimeter_bug_ft_pilot',
      valueType: 'float',
    });
  });

  it('parses a list response with large ids', () => {
    const raw = parseWith(dataRefListResponseSchema, dataRefListFixture, 'datarefs');
    expect(raw.data).toHaveLength(2);
    expect(raw.data[1]?.id).toBe(1253033683792);
    expect(raw.data[1]?.value_type).toBe('float_array');
  });

  it.each([
    [{ id: '1', name: 'x', value_type: 'float' }, 'string id'],
    [{ id: 1.5, name: 'x', value_type: 'float' }, 'fractional id'],
    [{ id: 1, value_type: 'float' }, 'missing name'],
    [{ id: 1, name: 'x', value_type: 'string' }, 'unknown value_type'],
  ])('rejects %j (%s)', (payload, _description) => {
    expect(dataRefSchema.safeParse(payload).success).toBe(false);
  });
});

describe('dataref value contract', () => {
  it.each([
    [{ data: 124.3 }, 124.3],
    [{ data: 7 }, 7],
    [{ data: [1, 2, 3] }, [1, 2, 3]],
    [{ data: 'U29tZSBkYXRh' }, 'U29tZSBkYXRh'],
  ])('accepts %j', (payload: { data: unknown }, expected: unknown) => {
    expect(parseWith(dataRefValueResponseSchema, payload, 'value').data).toEqual(expected);
  });

  it.each([[{ data: null }], [{ data: { nested: 1 } }], [{ data: [1, 'a'] }], [{}]])(
    'rejects %j',
    (payload) => {
      expect(dataRefValueResponseSchema.safeParse(payload).success).toBe(false);
    },
  );
});

describe('command contract', () => {
  it('parses the documented command', () => {
    const raw = parseWith(commandSchema, commandFixture, 'command');
    expect(toCommandDescriptor(raw)).toEqual({
      id: 2991,
      name: 'sim/developer/toggle_autopilot_constants',
      description: 'Toggle the autopilot constants window.',
    });
  });

  it('tolerates a missing description by defaulting to an empty string', () => {
    const raw = parseWith(commandSchema, { id: 1, name: 'sim/x' }, 'command');
    expect(toCommandDescriptor(raw).description).toBe('');
  });
});

describe('count and error contracts', () => {
  it('parses a count', () => {
    expect(parseWith(countResponseSchema, { data: 9554 }, 'count').data).toBe(9554);
  });

  it('parses the documented error payload', () => {
    expect(errorPayloadSchema.safeParse(errorFixture)).toMatchObject({
      success: true,
      data: { error_code: 'index_out_of_range', error_message: 'Index is out of range' },
    });
  });

  it('rejects an error payload without error_code', () => {
    expect(errorPayloadSchema.safeParse({ error_message: 'x' }).success).toBe(false);
  });
});
