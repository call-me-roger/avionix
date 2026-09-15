export interface ConnectorAuthOptions {
  dataDir?: string;
  code?: string;
  open?: boolean;
  now?: () => number;
  random?: () => string;
  maxAttempts?: number;
  windowMs?: number;
}

export type PairResult =
  { ok: true; token: string } | { ok: false; reason: 'invalid_code' | 'rate_limited' };

export class ConnectorAuth {
  constructor(options?: ConnectorAuthOptions);
  readonly open: boolean;
  readonly code: string;
  readonly dataDir: string;
  get pairingRequired(): boolean;
  tokenCount(): number;
  attemptTrackedClients(): number;
  isAuthorized(token: string | null | undefined): boolean;
  pair(code: string, clientKey: string): PairResult;
}

export function generatePairingCode(): string;
export function extractToken(req: {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}): string | null;
export function stripTokenQuery(url: string): string;
export const TOKEN_FILE: string;
