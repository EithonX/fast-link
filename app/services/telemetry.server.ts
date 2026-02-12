import { requestStorage } from '~/lib/logger.server';
import { fastLinkEmitter } from '~/services/event-bus.server';

/**
 * TelemetryService subscribing to application events.
 * Updates the AsyncLocalStorage context rather than logging immediately.
 * The actual log is emitted by the Request Handler's `finally` block.
 */
export class TelemetryService {
  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    fastLinkEmitter.on('fetch:complete', (payload) => {
      this.updateContext('fetch', {
        filename: payload.filename,
        fileSize: payload.fileSize,
        sha256: payload.sha256,
        isArchive: payload.isArchive,
        isZipCompressed: payload.isZipCompressed,
        durationMs: payload.durationMs,
      });
    });

    fastLinkEmitter.on('analyze:complete', (payload) => {
      this.updateContext('analysis', payload.diagnostics);
    });

    fastLinkEmitter.on('turnstile:verify', (payload) => {
      this.updateContext('turnstile', payload);
    });

    fastLinkEmitter.on('error', (payload) => {
      const store = requestStorage.getStore();
      if (store) {
        this.updateContext('backgroundError', {
          message:
            payload.error instanceof Error
              ? payload.error.message
              : String(payload.error),
          stack:
            payload.error instanceof Error ? payload.error.stack : undefined,
          context: payload.context,
        });
      } else {
        console.error('Global/Background Error:', payload.error);
      }
    });

    fastLinkEmitter.on('request:start', (payload) => {
      this.updateContext('targetUrl', payload.url);
    });
  }

  /**
   * Helper to safely update the AsyncLocalStorage store.
   */
  private updateContext(key: string, value: unknown) {
    const store = requestStorage.getStore();
    if (store) {
      store.customContext ??= {};
      store.customContext[key] = value;
    }
  }
}

// Singleton instance — listeners attach on module load
export const telemetryService = new TelemetryService();

/**
 * Idempotent initialization function.
 * Calling this inside `loader` ensures the module is imported
 * and side effects (listeners) are active.
 */
export function initTelemetry() {
  return telemetryService;
}
