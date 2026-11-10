import { describe, expect, it } from 'vitest';

import { validateUrl } from './server-utils';

describe('public media URL validation', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/media.mp4',
    'https://user:password@example.com/media.mp4',
    'http://localhost/file',
    'http://localhost./file',
    'http://metadata.google.internal/file',
    'http://127.1/file',
    'http://10.12.0.1/file',
    'http://192.168.56.1/file',
    'http://172.16.4.1/file',
    'http://169.254.169.254/file',
    'http://[::1]/file',
    'http://[fd00::1]/file',
    'http://[fe80::1]/file',
    'http://[::ffff:127.0.0.1]/file',
  ])('rejects non-public or unsafe input: %s', (url) => {
    expect(() => validateUrl(url)).toThrow();
  });

  it.each([
    'https://example.com/media.mp4',
    'http://media.example.org/movie.mkv?token=abc',
    'https://drive.usercontent.google.com/download?id=abc',
  ])('accepts a public media URL: %s', (url) => {
    expect(() => validateUrl(url)).not.toThrow();
  });
});
