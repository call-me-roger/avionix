export type QueryParams = Record<
  string,
  string | number | ReadonlyArray<string | number> | undefined
>;

function encodeKey(key: string): string {
  // X-Plane documents keys like filter[name]; keep the brackets readable.
  return encodeURIComponent(key).replace(/%5B/gi, '[').replace(/%5D/gi, ']');
}

export function buildQueryString(query: QueryParams): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined) {
      continue;
    }
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      parts.push(`${encodeKey(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}
