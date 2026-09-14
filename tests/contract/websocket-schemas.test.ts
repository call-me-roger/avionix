import { toDataRefUpdates } from '@/infrastructure/xplane/schemas/mappers';
import {
  commandUpdateMessageSchema,
  dataRefUpdateMessageSchema,
  incomingEnvelopeSchema,
  resultMessageSchema,
} from '@/infrastructure/xplane/schemas/websocket';
import commandUpdateFixture from '../fixtures/ws-command-update.json';
import dataRefUpdateFixture from '../fixtures/ws-dataref-update.json';
import resultErrorFixture from '../fixtures/ws-result-error.json';
import resultOkFixture from '../fixtures/ws-result-ok.json';

describe('websocket envelope', () => {
  it('extracts the type from any object with a string type', () => {
    expect(incomingEnvelopeSchema.parse({ type: 'whatever', extra: 1 })).toEqual({
      type: 'whatever',
    });
  });

  it('rejects messages without a string type', () => {
    expect(incomingEnvelopeSchema.safeParse({ req_id: 1 }).success).toBe(false);
    expect(incomingEnvelopeSchema.safeParse('text').success).toBe(false);
  });
});

describe('result messages', () => {
  it('parses success', () => {
    expect(resultMessageSchema.parse(resultOkFixture)).toEqual({
      req_id: 123,
      type: 'result',
      success: true,
    });
  });

  it('parses failure with error fields', () => {
    expect(resultMessageSchema.parse(resultErrorFixture)).toEqual({
      req_id: 123,
      type: 'result',
      success: false,
      error_code: 'index_out_of_range',
      error_message: 'Index is out of range',
    });
  });

  it('rejects a result without req_id or without success', () => {
    expect(resultMessageSchema.safeParse({ type: 'result', success: true }).success).toBe(false);
    expect(resultMessageSchema.safeParse({ type: 'result', req_id: 1 }).success).toBe(false);
  });
});

describe('dataref update messages', () => {
  it('parses the documented update and maps keys to numeric ids, trimming whitespace', () => {
    const message = dataRefUpdateMessageSchema.parse(dataRefUpdateFixture);
    const updates = toDataRefUpdates(message.data, 1000);
    expect(updates).toEqual([
      { id: 88491, value: 0, receivedAt: 1000 },
      { id: 3994, value: 5, receivedAt: 1000 },
      { id: 199, value: [0, 0, 0, 4], receivedAt: 1000 },
    ]);
  });

  it('drops keys that are not numeric', () => {
    expect(toDataRefUpdates({ abc: 1, '5': 2 }, 0)).toEqual([{ id: 5, value: 2, receivedAt: 0 }]);
  });

  it('accepts base64 string values', () => {
    expect(
      dataRefUpdateMessageSchema.safeParse({ type: 'dataref_update_values', data: { '1': 'QQ==' } })
        .success,
    ).toBe(true);
  });

  it('rejects non-value entries', () => {
    expect(
      dataRefUpdateMessageSchema.safeParse({ type: 'dataref_update_values', data: { '1': null } })
        .success,
    ).toBe(false);
    expect(dataRefUpdateMessageSchema.safeParse({ type: 'dataref_update_values' }).success).toBe(
      false,
    );
  });
});

describe('command update messages', () => {
  it('parses the documented payload', () => {
    expect(commandUpdateMessageSchema.parse(commandUpdateFixture).data).toEqual({
      '88491': false,
      '3994': false,
      '199': true,
    });
  });
});
