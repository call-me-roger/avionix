import { buildQueryString } from '@/infrastructure/xplane/http/query-string';

describe('buildQueryString', () => {
  it('returns an empty string for no params', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ a: undefined })).toBe('');
  });

  it('keeps X-Plane filter brackets readable and encodes values', () => {
    expect(buildQueryString({ 'filter[name]': 'sim/cockpit2/a b' })).toBe(
      '?filter[name]=sim%2Fcockpit2%2Fa%20b',
    );
  });

  it('repeats array params', () => {
    expect(buildQueryString({ 'filter[name]': ['a', 'b'], limit: 2 })).toBe(
      '?filter[name]=a&filter[name]=b&limit=2',
    );
  });
});
