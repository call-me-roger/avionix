import { appendTokenQuery, noAuth, urlWithoutQuery } from '@/infrastructure/xplane/auth';

describe('appendTokenQuery', () => {
  it('appends the token with ? when the URL has no query', () => {
    expect(appendTokenQuery('ws://pc.local:8080/api/v3', 'abc')).toBe(
      'ws://pc.local:8080/api/v3?token=abc',
    );
  });

  it('appends the token with & when the URL already has a query', () => {
    expect(appendTokenQuery('ws://pc.local:8080/api/v3?a=1', 'abc')).toBe(
      'ws://pc.local:8080/api/v3?a=1&token=abc',
    );
  });

  it('URL-encodes the token', () => {
    expect(appendTokenQuery('ws://pc.local/api/v3', 'a b/c+d')).toBe(
      'ws://pc.local/api/v3?token=a%20b%2Fc%2Bd',
    );
  });
});

describe('urlWithoutQuery', () => {
  it('drops everything from the first question mark', () => {
    expect(urlWithoutQuery('ws://pc.local/api/v3?token=secret')).toBe('ws://pc.local/api/v3');
    expect(urlWithoutQuery('ws://pc.local/api/v3')).toBe('ws://pc.local/api/v3');
  });
});

describe('noAuth', () => {
  it('always returns null', () => {
    expect(noAuth()).toBeNull();
  });
});
