/**
 * Shared browser-side URL handling for FastLink's existing /p/ protocol.
 * The source remains reversibly encoded; this is not encryption.
 */
export function normalizeDirectUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password
  ) {
    throw new Error('Enter a public HTTP or HTTPS link without a username or password.');
  }
  return url.toString();
}

export function suggestFilename(source: string): string {
  const last = new URL(source).pathname.split('/').filter(Boolean).at(-1);
  if (!last) return 'download';

  try {
    return decodeURIComponent(last).trim() || 'download';
  } catch {
    return last.trim() || 'download';
  }
}

export function createFastLink(
  origin: string,
  source: string,
  filename = suggestFilename(source),
): string {
  const normalized = normalizeDirectUrl(source);
  return (
    origin.replace(/\/+$/, '') +
    '/p/' +
    encodeURIComponent(btoa(normalized)) +
    '/' +
    encodeURIComponent(filename)
  );
}
