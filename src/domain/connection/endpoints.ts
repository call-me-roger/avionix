import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import type { ApiVersion } from '@/domain/simulator/api-version';

export function httpOrigin(config: XPlaneConnectionConfig): string {
  return `http://${config.host}:${config.port}`;
}

export function wsOrigin(config: XPlaneConnectionConfig): string {
  return `ws://${config.host}:${config.port}`;
}

export function capabilitiesPath(): string {
  return '/api/capabilities';
}

export function restPath(version: ApiVersion, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/api/${version}${normalized}`;
}

export function webSocketUrl(config: XPlaneConnectionConfig, version: ApiVersion): string {
  return `${wsOrigin(config)}/api/${version}`;
}
