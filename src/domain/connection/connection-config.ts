import { AvionixError } from '@/domain/errors/avionix-error';

export interface XPlaneConnectionConfig {
  host: string;
  port: number;
}

export const DEFAULT_PORT = 8086;

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOSTNAME_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function invalidHost(reason: string): AvionixError {
  return new AvionixError({ code: 'INVALID_HOST', message: `Invalid host: ${reason}` });
}

function invalidPort(reason: string): AvionixError {
  return new AvionixError({ code: 'INVALID_PORT', message: `Invalid port: ${reason}` });
}

function isValidIpv4(host: string): boolean {
  const match = IPV4_PATTERN.exec(host);
  if (match === null) {
    return false;
  }
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

function isValidHostname(host: string): boolean {
  if (host.length > 253) {
    return false;
  }
  const labels = host.split('.');
  return labels.every((label) => HOSTNAME_LABEL_PATTERN.test(label));
}

export function validateHost(input: string): string {
  const host = input.trim().toLowerCase();
  if (host.length === 0) {
    throw invalidHost('host is empty');
  }
  if (host.includes('://')) {
    throw invalidHost('enter a host name or IP address without http:// or ws://');
  }
  if (host.includes('/')) {
    throw invalidHost('host must not contain a path');
  }
  if (host.includes(':')) {
    throw invalidHost('host must not contain a port or be an IPv6 address');
  }
  if (/\s/.test(host)) {
    throw invalidHost('host must not contain whitespace');
  }
  if (IPV4_PATTERN.test(host)) {
    if (!isValidIpv4(host)) {
      throw invalidHost('IPv4 octets must be between 0 and 255');
    }
    return host;
  }
  if (/^[\d.]+$/.test(host)) {
    throw invalidHost('IPv4 address must have four octets');
  }
  if (!isValidHostname(host)) {
    throw invalidHost('host name contains invalid characters');
  }
  return host;
}

export function validatePort(input: string | number): number {
  const text = typeof input === 'number' ? String(input) : input.trim();
  if (!/^\d+$/.test(text)) {
    throw invalidPort('port must be a whole number');
  }
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw invalidPort('port must be between 1 and 65535');
  }
  return port;
}

export function createConnectionConfig(
  host: string,
  port: string | number,
): XPlaneConnectionConfig {
  return { host: validateHost(host), port: validatePort(port) };
}
