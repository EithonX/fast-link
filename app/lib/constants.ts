export function getTurnstileSiteKey() {
  if (import.meta.env.DEV) {
    return '1x00000000000000000000AA';
  }
  if (typeof window !== 'undefined') {
    return (
      window.ENV?.TURNSTILE_SITE_KEY ||
      import.meta.env.VITE_TURNSTILE_SITE_KEY ||
      ''
    );
  }
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
}
