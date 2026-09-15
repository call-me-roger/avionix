import type { Advertiser } from './avionix-connector-mdns';

export interface BridgeOptions {
  port?: number;
  host?: string;
  xplaneHost?: string;
  xplanePort?: number;
  staticDir?: string;
  log?: (line: string) => void;
  open?: boolean;
  code?: string;
  dataDir?: string;
  name?: string;
  mdns?: boolean;
  advertiser?: Advertiser;
  version?: string;
  networkInterfaces?: () => NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>;
}

export interface BridgeHandle {
  port: number;
  host: string;
  pairingCode: string | null;
  pairingRequired: boolean;
  urls: string[];
  close(): Promise<void>;
}

export function startBridge(options?: BridgeOptions): Promise<BridgeHandle>;
export function parseArgs(
  argv: string[],
): Required<Omit<BridgeOptions, 'log' | 'advertiser' | 'version' | 'networkInterfaces'>> | 'help';
export function usage(): string;
export const DEFAULTS: Readonly<
  Required<Omit<BridgeOptions, 'log' | 'advertiser' | 'version' | 'networkInterfaces'>>
>;
