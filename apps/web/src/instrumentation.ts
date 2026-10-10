import type { Instrumentation } from 'next';
import { serverErrorLogFields } from '@/lib/server-error-log';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeObservability } = await import('./instrumentation.node');
    registerNodeObservability();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const fields = serverErrorLogFields(error, request, context);

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reportServerError } = await import('./instrumentation.node');
    reportServerError(fields);
    return;
  }

  console.error(JSON.stringify(fields));
};
