import { EventEmitter } from 'node:events';

import type { MediaInfoDiagnostics } from '~/services/mediainfo.server';

/**
 * Event payloads for type safety
 */
export interface FastLinkEvents {
  'request:start': { requestId: string; url: string };
  'turnstile:verify': { success: boolean; token: string; outcome?: unknown };
  'fetch:complete': {
    filename: string;
    fileSize: number;
    sha256?: string;
    isArchive: boolean;
    isZipCompressed: boolean;
    durationMs: number;
  };
  'analyze:complete': {
    results: Record<string, string>;
    diagnostics: MediaInfoDiagnostics;
  };
  error: { error: unknown; context?: Record<string, unknown> };
}

/**
 * Typed EventEmitter for FastLink
 */
export class FastLinkEmitter extends EventEmitter {
  constructor() {
    super({ captureRejections: true });
  }

  emit<K extends keyof FastLinkEvents>(
    eventName: K,
    payload: FastLinkEvents[K],
  ): boolean {
    return super.emit(eventName, payload);
  }

  on<K extends keyof FastLinkEvents>(
    eventName: K,
    listener: (payload: FastLinkEvents[K]) => void | Promise<void>,
  ): this {
    return super.on(eventName, (payload: FastLinkEvents[K]) => {
      void listener(payload);
    });
  }

  once<K extends keyof FastLinkEvents>(
    eventName: K,
    listener: (payload: FastLinkEvents[K]) => void | Promise<void>,
  ): this {
    return super.once(eventName, (payload: FastLinkEvents[K]) => {
      void listener(payload);
    });
  }
}

// Global singleton instance
export const fastLinkEmitter = new FastLinkEmitter();

// Ensure errors are handled to prevent unhandled rejections
fastLinkEmitter.on('error', (payload) => {
  // The actual logging happens in TelemetryService.
  // This no-op listener prevents EventEmitter from throwing.
  void payload;
});
