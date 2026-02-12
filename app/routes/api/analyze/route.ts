import { DiagnosticsError } from '~/lib/error-utils';
import { type LogContext, log, requestStorage } from '~/lib/logger.server';
import { analyzeSchema } from '~/lib/schemas';
import { TurnstileResponseSchema } from '~/lib/schemas/turnstile';
import { fastLinkEmitter } from '~/services/event-bus.server';
import { fetchMediaChunk } from '~/services/media-fetch.server';
import { analyzeMediaBuffer } from '~/services/mediainfo.server';
import { initTelemetry } from '~/services/telemetry.server';

import type { Route } from './+types/route';

export async function loader({ request, context }: Route.LoaderArgs) {
  // Ensure telemetry listeners are wired up
  initTelemetry();

  const startTime = performance.now();
  const url = new URL(request.url);
  const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();

  // Create ALS context for this request
  const logContext: LogContext = {
    requestId,
    httpRequest: {
      requestMethod: request.method,
      requestUrl: url.pathname,
      status: 200,
      remoteIp: request.headers.get('CF-Connecting-IP') ?? undefined,
      userAgent: request.headers.get('User-Agent') ?? undefined,
    },
    customContext: {
      params: Object.fromEntries(url.searchParams),
    } as Record<string, unknown>,
  };

  return requestStorage.run(logContext, async () => {
    let status = 200;
    let severity: 'INFO' | 'WARNING' | 'ERROR' = 'INFO';

    try {
      const validationResult = analyzeSchema.safeParse(
        Object.fromEntries(url.searchParams),
      );

      // --- Turnstile Validation ---
      const turnstileToken = request.headers.get('CF-Turnstile-Response');
      const secretKey = import.meta.env.DEV
        ? '1x00000000000000000000AA'
        : context.cloudflare.env.TURNSTILE_SECRET_KEY;

      if (
        (context.cloudflare.env.ENABLE_TURNSTILE as string) === 'true' &&
        secretKey
      ) {
        if (!turnstileToken) {
          status = 403;
          severity = 'WARNING';
          fastLinkEmitter.emit('turnstile:verify', {
            success: false,
            token: '',
          });
          return Response.json(
            {
              error:
                'Security verification is required. Please complete the check.',
            },
            { status: 403 },
          );
        }

        // Bypass verification for dev
        if (turnstileToken === 'localhost-mock-token' || import.meta.env.DEV) {
          fastLinkEmitter.emit('turnstile:verify', {
            success: true,
            token: turnstileToken,
            outcome: 'BYPASS_DEV',
          });
        } else {
          const formData = new FormData();
          formData.append('secret', secretKey);
          formData.append('response', turnstileToken);
          formData.append(
            'remoteip',
            request.headers.get('CF-Connecting-IP') ?? '',
          );

          const result = await fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
              method: 'POST',
              body: formData,
            },
          );

          const outcome = TurnstileResponseSchema.parse(await result.json());
          if (!outcome.success) {
            status = 403;
            severity = 'WARNING';
            fastLinkEmitter.emit('turnstile:verify', {
              success: false,
              token: turnstileToken,
              outcome,
            });
            return Response.json(
              {
                error:
                  'Security check failed. Please refresh and try again.',
              },
              { status: 403 },
            );
          }
          fastLinkEmitter.emit('turnstile:verify', {
            success: true,
            token: turnstileToken,
            outcome,
          });
        }
      }
      // ----------------------------

      if (!validationResult.success) {
        const { fieldErrors } = validationResult.error.flatten();
        const serverError =
          fieldErrors.url?.[0] ??
          fieldErrors.format?.[0] ??
          'The input provided is invalid.';

        status = 400;
        severity = 'WARNING';

        return Response.json({ error: serverError }, { status: 400 });
      }

      const { url: initialUrl, format: requestedFormats } =
        validationResult.data;

      fastLinkEmitter.emit('request:start', {
        requestId,
        url: initialUrl,
      });

      // 1. Fetch Media Chunk
      const { buffer, fileSize, filename } = await fetchMediaChunk(initialUrl);

      // 2. Analyze
      const { results } = await analyzeMediaBuffer(
        buffer,
        fileSize,
        filename,
        requestedFormats,
      );

      return Response.json({ results });
    } catch (error) {
      status = 500;
      severity = 'ERROR';

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';

      // Emit via event bus for telemetry
      fastLinkEmitter.emit('error', {
        error,
        context:
          error instanceof DiagnosticsError
            ? (error.diagnostics as Record<string, unknown>)
            : undefined,
      });

      return Response.json({ error: errorMessage }, { status: 500 });
    } finally {
      if (logContext.httpRequest) {
        logContext.httpRequest.status = status;
        logContext.httpRequest.latency = `${String((performance.now() - startTime) / 1000)}s`;
      }

      log({
        severity,
        message: 'Media Analysis Request',
        requestId,
      });
    }
  });
}
