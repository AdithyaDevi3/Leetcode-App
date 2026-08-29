const REQUEST_ID = 'x-request-id';
const safeRequestId = /^[a-zA-Z0-9_-]{16,128}$/;

export function getOrCreateRequestId(incoming?: string | null, generate = () => crypto.randomUUID()): string {
  return incoming && safeRequestId.test(incoming) ? incoming : generate();
}

export const requestIdHeader = REQUEST_ID;
