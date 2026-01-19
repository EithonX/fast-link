import { log } from '~/lib/logger.server';
import { analyzeSchema } from '~/lib/schemas';
import { fetchMediaChunk } from '~/services/media-fetch.server';
import { analyzeMediaBuffer } from '~/services/mediainfo.server';

import type { Route } from './+types/resource.analyze';

export async function loader({ request, context }: Route.LoaderArgs) {
  const startTime = performance.now();
  const url = new URL(request.url);

  // 1. Identity: Generate Request ID immediately for correlation
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();

  // Initialize Wide Event Context
  // We use UPPER_SNAKE_CASE for status enums in context
  const logCtx: Record<string, unknown> = {
    params: Object.fromEntries(url.searchParams),
  };

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
        logCtx.turnstile = { result: 'MISSING_TOKEN' };
        return Response.json(
          {
            error:
              'Security verification is required. Please complete the check.',
            requestId,
          },
          { status: 403 },
        );
      }

      // Bypass verification for localhost mock token
      if (turnstileToken === 'localhost-mock-token' || import.meta.env.DEV) {
        logCtx.turnstile = { result: 'BYPASS_DEV' };
      } else {
        const formData = new FormData();
        formData.append('secret', secretKey);
        formData.append('response', turnstileToken);
        formData.append(
          'remoteip',
          request.headers.get('CF-Connecting-IP') || '',
        );

        const result = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            body: formData,
          },
        );

        const outcome = (await result.json()) as { success: boolean };
        if (!outcome.success) {
          status = 403;
          severity = 'WARNING';
          logCtx.turnstile = { result: 'FAILED', outcome };
          return Response.json(
            {
              error: 'Security check failed. Please refresh and try again.',
              requestId,
            },
            { status: 403 },
          );
        }
        logCtx.turnstile = { result: 'SUCCESS' };
      }
    }
    // ----------------------------

    if (!validationResult.success) {
      const { fieldErrors } = validationResult.error.flatten();
      const serverError =
        fieldErrors.url?.[0] ||
        fieldErrors.format?.[0] ||
        'The input provided is invalid.';

      status = 400;
      severity = 'WARNING';
      logCtx.validationError = fieldErrors;

      return Response.json({ error: serverError, requestId }, { status: 400 });
    }

    const { url: initialUrl, format: requestedFormats } = validationResult.data;
    logCtx.targetUrl = initialUrl;
    logCtx.requestedFormats = requestedFormats;

    // 1. Fetch Media Chunk (includes validation, resolution, streaming)
    const {
      buffer,
      fileSize,
      filename,
      diagnostics: fetchDiagnostics,
    } = await fetchMediaChunk(initialUrl);

    // Spread fetch diagnostics into context under a namespace
    logCtx.fetch = fetchDiagnostics;
    logCtx.fileSize = fileSize;
    logCtx.filename = filename;

    // 2. Analyze
    const { results, diagnostics: analysisDiagnostics } =
      await analyzeMediaBuffer(buffer, fileSize, filename, requestedFormats);

    // Spread analysis diagnostics
    logCtx.analysis = analysisDiagnostics;

    return Response.json({ results });
  } catch (error) {
    status = 500;
    severity = 'ERROR';

    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred.';

    // Error Object Structure
    const errorObj = {
      code: 500,
      message: errorMessage,
      details: error instanceof Error ? error.stack : String(error),
    };

    logCtx.error = errorObj;

    return Response.json({ error: errorMessage, requestId }, { status: 500 });
  } finally {
    log({
      severity,
      message: 'Media Analysis Request',
      requestId,
      httpRequest: {
        requestMethod: request.method,
        requestUrl: url.pathname,
        status,
        remoteIp: request.headers.get('CF-Connecting-IP') || undefined,
        userAgent: request.headers.get('User-Agent') || undefined,
        latency: `${(performance.now() - startTime) / 1000}s`,
      },
      context: logCtx,
    });
  }
}
