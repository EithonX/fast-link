/**
 * An Error subclass that carries diagnostic data through error boundaries.
 *
 * This allows services like media-fetch and mediainfo to attach partial
 * diagnostic information to errors, so the route handler can still log
 * useful telemetry even when the request fails.
 *
 * @example
 * ```ts
 * throw new DiagnosticsError('Stream reading failed', fetchDiagnostics, originalError);
 * ```
 */
export class DiagnosticsError<
  T = Record<string, unknown>,
> extends Error {
  public readonly diagnostics: T;

  constructor(message: string, diagnostics: T, cause?: unknown) {
    super(message, { cause });
    this.name = 'DiagnosticsError';
    this.diagnostics = diagnostics;
  }
}
