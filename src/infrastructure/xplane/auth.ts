/**
 * Supplies the bearer token for one connection, or null when the target needs no token.
 * Read at request time (HTTP) and at connect time (WebSocket) so a token obtained after the
 * transport was constructed is picked up on the next call.
 */
export type AuthProvider = () => string | null;

export const noAuth: AuthProvider = () => null;

/**
 * Browsers cannot set headers on a WebSocket upgrade, so the connector accepts `?token=`.
 * The URL has no query today; the `&` branch keeps this correct if one is ever added.
 */
export function appendTokenQuery(url: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/** Strips the query string so a URL carrying a token can be logged or shown in an error. */
export function urlWithoutQuery(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}
