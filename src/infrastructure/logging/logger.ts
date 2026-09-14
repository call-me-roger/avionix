export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  'connection' | 'http' | 'websocket' | 'dataref' | 'command' | 'session' | 'ui';

export interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

declare const __DEV__: boolean | undefined;

function defaultMinLevel(): LogLevel {
  const isDev = typeof __DEV__ === 'undefined' ? true : __DEV__;
  return isDev ? 'debug' : 'warn';
}

export const consoleSink: LogSink = {
  write(entry) {
    const line = `[avionix:${entry.category}] ${entry.message}`;
    const args: unknown[] = entry.data === undefined ? [line] : [line, entry.data];
    switch (entry.level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
  },
};

export function createMemorySink(): LogSink & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry) {
      entries.push(entry);
    },
  };
}

export function createLogger(
  category: LogCategory,
  options: { sink?: LogSink; minLevel?: LogLevel } = {},
): Logger {
  const sink = options.sink ?? consoleSink;
  const minLevel = options.minLevel ?? defaultMinLevel();
  const emit = (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
      return;
    }
    const entry: LogEntry = { level, category, message, timestamp: Date.now() };
    if (data !== undefined) {
      entry.data = data;
    }
    sink.write(entry);
  };
  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}

const noop = (): void => undefined;

export const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };
