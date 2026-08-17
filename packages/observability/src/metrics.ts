export { metrics } from '@opentelemetry/api';

// Re-export common metric types for convenience
export type {
  Counter,
  Histogram,
  ObservableGauge,
  UpDownCounter,
} from '@opentelemetry/api';
