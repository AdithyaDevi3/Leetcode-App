import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

export interface ObservabilityConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  otlpEndpoint?: string;
  samplingRate?: number;
}

let sdkInstance: NodeSDK | null = null;

export function initObservability(config: ObservabilityConfig): void {
  if (sdkInstance) {
    console.warn('Observability already initialized');
    return;
  }

  const {
    serviceName,
    serviceVersion = '0.1.0',
    environment = 'development',
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    samplingRate = environment === 'production' ? 0.1 : 1.0,
  } = config;

  // Resource describes the service
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  // Trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  // Metrics exporter
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
    }),
    exportIntervalMillis: 60000, // Export every 60 seconds
  });

  // Initialize SDK
  sdkInstance = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Customize auto-instrumentation
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            // Ignore health check endpoints
            const url = req.url || '';
            return url.includes('/health') || url.includes('/metrics');
          },
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
      }),
    ],
  });

  // Start the SDK
  sdkInstance
    .start()
    .then(() => {
      console.log(`OpenTelemetry SDK started for ${serviceName}`);
    })
    .catch((error) => {
      console.error('Error starting OpenTelemetry SDK:', error);
    });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    if (sdkInstance) {
      await sdkInstance.shutdown();
      console.log('OpenTelemetry SDK shutdown complete');
    }
  });
}

export function getSDK(): NodeSDK | null {
  return sdkInstance;
}
