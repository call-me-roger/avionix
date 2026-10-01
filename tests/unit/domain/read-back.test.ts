import { READ_BACK_MS, readBackVerdict, readsAs } from '@/domain/panels/read-back';

const base = {
  current: 121_500 as number | undefined,
  expected: 118_005,
  operation: { status: 'ok' as const, at: 1_000 },
  startedAt: 900,
  valuesCurrent: true,
  now: 1_000,
};

describe('read-back verdict', () => {
  it('is adopted as soon as the value reads as expected', () => {
    expect(readBackVerdict({ ...base, current: 118_005 })).toBe('adopted');
  });

  it('waits while the write is pending or not yet recorded', () => {
    expect(readBackVerdict({ ...base, operation: undefined })).toBe('waiting');
    expect(readBackVerdict({ ...base, operation: { status: 'pending', at: 950 } })).toBe('waiting');
  });

  it('ignores an outcome from an earlier press', () => {
    expect(readBackVerdict({ ...base, operation: { status: 'ok', at: 800 }, now: 10_000 })).toBe(
      'waiting',
    );
  });

  it('counts the window from the moment X-Plane accepted the write', () => {
    expect(readBackVerdict({ ...base, now: 1_000 + READ_BACK_MS - 1 })).toBe('waiting');
    expect(readBackVerdict({ ...base, now: 1_000 + READ_BACK_MS })).toBe('notAdopted');
  });

  it('gives no verdict for a failed or refused operation, whose own failure is shown', () => {
    expect(
      readBackVerdict({ ...base, operation: { status: 'failed', at: 1_000 }, now: 9_000 }),
    ).toBe('abandoned');
  });

  it('gives no verdict once the link is not current', () => {
    expect(readBackVerdict({ ...base, valuesCurrent: false, now: 9_000 })).toBe('abandoned');
    expect(readBackVerdict({ ...base, valuesCurrent: false, operation: undefined })).toBe(
      'abandoned',
    );
  });

  it('reads whole-number values, first array element included', () => {
    expect(readsAs(3, 3)).toBe(true);
    expect(readsAs(3.2, 3)).toBe(true);
    expect(readsAs(3.6, 3)).toBe(false);
    expect(readsAs([3, 0], 3)).toBe(true);
    expect(readsAs('AAAA', 3)).toBe(false);
    expect(readsAs(undefined, 3)).toBe(false);
  });
});
