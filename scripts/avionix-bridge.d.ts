export interface BridgeOptions {
  port?: number;
  host?: string;
  xplaneHost?: string;
  xplanePort?: number;
  staticDir?: string;
  log?: (line: string) => void;
}

export interface BridgeHandle {
  port: number;
  host: string;
  close(): Promise<void>;
}

export function startBridge(options?: BridgeOptions): Promise<BridgeHandle>;
export function parseArgs(argv: string[]): Required<Omit<BridgeOptions, 'log'>> | 'help';
export function usage(): string;
export const DEFAULTS: Required<Omit<BridgeOptions, 'log'>>;
