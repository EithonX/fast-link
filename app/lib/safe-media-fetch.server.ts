import { validateUrl } from './server-utils';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/**
 * Enforce URL validation on the initial request and every redirect, instead of
 * letting fetch() automatically follow redirects to private or local targets.
 * Keep GET/HEAD, headers, and Range semantics for FastLink media fetches.
 */
export async function safeMediaFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error('Only GET and HEAD requests are supported for media.');
  }

  let currentUrl = new URL(input);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    validateUrl(currentUrl.href);

    const response = await fetch(currentUrl.href, {
      ...init,
      method,
      redirect: 'manual',
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    void response.body?.cancel();

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error('Too many media redirects.');
    }
    if (!location) {
      throw new Error('Media redirect has no Location header.');
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new Error('Too many media redirects.');
}
