import { describe, it, expect } from 'vitest';
import { trace, metrics } from '../src';

describe('Observability Exports', () => {
  it('should export trace API', () => {
    expect(trace).toBeDefined();
    expect(trace.getTracer).toBeDefined();
  });

  it('should export metrics API', () => {
    expect(metrics).toBeDefined();
  });

  it('should allow getting a tracer', () => {
    const tracer = trace.getTracer('test-tracer');
    expect(tracer).toBeDefined();
    expect(tracer.startSpan).toBeDefined();
  });

  it('should allow creating a span', () => {
    const tracer = trace.getTracer('test-tracer');
    const span = tracer.startSpan('test-span');
    
    expect(span).toBeDefined();
    expect(span.end).toBeDefined();
    
    // Clean up
    span.end();
  });
});
