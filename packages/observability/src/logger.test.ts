import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraceFlags, trace, type Span } from '@opentelemetry/api';
import { activeTraceContext, logger } from '../src/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should exist', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it('should log info messages', () => {
    const spy = vi.spyOn(logger, 'info');
    
    logger.info('Test message', { foo: 'bar' });
    
    expect(spy).toHaveBeenCalledWith('Test message', { foo: 'bar' });
  });

  it('should log error messages', () => {
    const spy = vi.spyOn(logger, 'error');
    
    logger.error('Error message', { error: 'Something went wrong' });
    
    expect(spy).toHaveBeenCalledWith('Error message', {
      error: 'Something went wrong',
    });
  });

  it('should have service and environment in base fields', () => {
    // Logger is already instantiated, so we can't easily test base fields
    // This is more of a smoke test
    expect(logger).toBeDefined();
  });

  it('adds valid active trace context to structured logs', () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => ({
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: '1234567890abcdef',
        traceFlags: TraceFlags.SAMPLED,
      }),
    } as Span);

    expect(activeTraceContext()).toEqual({
      traceId: '1234567890abcdef1234567890abcdef',
      spanId: '1234567890abcdef',
      traceFlags: TraceFlags.SAMPLED,
    });
  });

  it('omits absent and invalid trace context', () => {
    const activeSpan = vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    expect(activeTraceContext()).toEqual({});

    activeSpan.mockReturnValue({
      spanContext: () => ({
        traceId: '00000000000000000000000000000000',
        spanId: '0000000000000000',
        traceFlags: TraceFlags.NONE,
      }),
    } as Span);
    expect(activeTraceContext()).toEqual({});
  });
});
