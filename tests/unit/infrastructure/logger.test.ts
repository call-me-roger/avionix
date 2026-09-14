import { createLogger, createMemorySink, silentLogger } from '@/infrastructure/logging/logger';

describe('createLogger', () => {
  it('writes entries at or above minLevel with category and data', () => {
    const sink = createMemorySink();
    const logger = createLogger('http', { sink, minLevel: 'info' });
    logger.debug('hidden');
    logger.info('request', { path: '/api/capabilities' });
    logger.warn('slow');
    logger.error('failed', { status: 500 });

    expect(sink.entries.map((entry) => entry.level)).toEqual(['info', 'warn', 'error']);
    expect(sink.entries[0]).toMatchObject({
      category: 'http',
      message: 'request',
      data: { path: '/api/capabilities' },
    });
    expect(typeof sink.entries[0]?.timestamp).toBe('number');
  });

  it('defaults minLevel to debug in tests', () => {
    const sink = createMemorySink();
    createLogger('session', { sink }).debug('visible');
    expect(sink.entries).toHaveLength(1);
  });

  it('silentLogger never throws and never writes', () => {
    expect(() => silentLogger.error('ignored')).not.toThrow();
  });
});
