import { describe, expect, it } from 'vitest';

import { createFastLink, normalizeDirectUrl, suggestFilename } from './fastlink-url';

describe('FastLink URL compatibility', () => {
  it('keeps the original /p/<base64>/<filename> download format', () => {
    const source = 'https://media.example.com/movie.mp4?token=a%2Fb';
    const link = createFastLink('https://dl.example.com/', source);
    const segments = new URL(link).pathname.split('/');
    expect(segments[1]).toBe('p');
    expect(atob(decodeURIComponent(segments[2]))).toBe(source);
    expect(decodeURIComponent(segments[3])).toBe('movie.mp4');
  });

  it('normalizes international file URLs before base64 encoding', () => {
    const source = normalizeDirectUrl('https://example.com/ভিডিও.mp4');
    const link = createFastLink('https://dl.example.com', source);
    const segments = new URL(link).pathname.split('/');
    expect(atob(decodeURIComponent(segments[2]))).toBe(source);
    expect(suggestFilename(source)).toBe('ভিডিও.mp4');
  });

  it('uses a helpful filename for URLs without a path', () => {
    expect(suggestFilename('https://example.com/')).toBe('download');
  });

  it('rejects invalid schemes and embedded credentials', () => {
    expect(() => normalizeDirectUrl('file:///etc/passwd')).toThrow();
    expect(() => normalizeDirectUrl('https://user:secret@example.com/x')).toThrow();
    expect(() => normalizeDirectUrl('not a link')).toThrow();
  });
});
