const MAX_ERROR_MESSAGE_LENGTH = 1_000;

type RequestDetails = {
  method: string;
  path: string;
};

type RequestContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
  renderType?: string;
};

export function serverErrorLogFields(
  error: unknown,
  request: RequestDetails,
  context: RequestContext,
) {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorMessage = error instanceof Error ? error.message : 'A non-Error value was thrown';
  const errorDigest = typeof error === 'object' && error !== null && 'digest' in error
    && typeof error.digest === 'string' ? error.digest : undefined;

  return {
    event: 'next.server.error',
    errorName,
    errorMessage: errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    ...(errorDigest ? { errorDigest } : {}),
    requestMethod: request.method,
    requestPath: request.path.split('?', 1)[0],
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    ...(context.renderSource ? { renderSource: context.renderSource } : {}),
    ...(context.revalidateReason ? { revalidateReason: context.revalidateReason } : {}),
    ...(context.renderType ? { renderType: context.renderType } : {}),
  };
}
