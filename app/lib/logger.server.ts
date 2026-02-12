import { AsyncLocalStorage } from 'node:async_hooks';

const SERVICE_NAME = 'fastlink-worker';
const SERVICE_VERSION = '1.0.0';

export interface LogContext {
  requestId: string;
  httpRequest?: {
    requestMethod: string;
    requestUrl: string;
    status: number;
    remoteIp?: string;
    userAgent?: string;
    latency?: string;
  };
  customContext?: Record<string, unknown>;
}

export interface LogEvent {
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  requestId?: string;

  httpRequest?: {
    requestMethod: string;
    requestUrl: string;
    status: number;
    remoteIp?: string;
    userAgent?: string;
    latency?: string;
  };
  context?: Record<string, unknown>;
  error?: unknown;

  [key: string]: unknown;
}

/**
 * AsyncLocalStorage instance for request-scoped context.
 * Wrap your request handler in `requestStorage.run(context, callback)`
 * to make context available in all downstream functions.
 */
export const requestStorage = new AsyncLocalStorage<LogContext>();

/**
 * Tail Sampling Logic:
 * - Always keep ERROR/WARNING
 * - Always keep slow requests (> 2s)
 * - Always keep in dev
 * - Sample 10% of everything else
 */
function shouldSample(event: LogEvent): boolean {
  if (event.severity === 'ERROR' || event.severity === 'WARNING') return true;

  if (event.httpRequest?.latency) {
    const latencySec = parseFloat(event.httpRequest.latency.replace('s', ''));
    if (!isNaN(latencySec) && latencySec > 2.0) return true;
  }

  if (import.meta.env.DEV) return true;

  return Math.random() < 0.1;
}

/**
 * Standardized JSON Logger with AsyncLocalStorage integration.
 * Automatically merges request context from ALS store.
 */
export function log(event: LogEvent) {
  if (!shouldSample(event)) return;

  // Merge ALS store context into event
  const store = requestStorage.getStore();
  const mergedEvent: LogEvent = {
    ...event,
    requestId: event.requestId ?? store?.requestId,
    httpRequest: event.httpRequest ?? store?.httpRequest,
    context: {
      ...store?.customContext,
      ...event.context,
    },
  };

  const logPayload = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    ...mergedEvent,
  });

  switch (mergedEvent.severity) {
    case 'ERROR':
      console.error(logPayload);
      break;
    case 'WARNING':
      console.warn(logPayload);
      break;
    case 'INFO':
    default:
      console.log(logPayload);
      break;
  }
}
