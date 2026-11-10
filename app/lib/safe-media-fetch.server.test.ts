import { afterEach, describe, expect, it, vi } from 'vitest';

import { safeMediaFetch } from './safe-media-fetch.server';

afterEach(() => vi.restoreAllMocks());

describe('safeMediaFetch', () => {
  it('follows public redirects and preserves range headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: 'https://cdn.example.org/video.mp4' },
      }))
      .mockResolvedValueOnce(new Response('media', { status: 206 }));

    const result = await safeMediaFetch('https://example.com/file', {
      headers: { Range: 'bytes=100-199' },
    });

    expect(result.status).toBe(206);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe('https://cdn.example.org/video.mp4');
    expect(new Headers(fetchSpy.mock.calls[1][1]?.headers).get('Range'))
      .toBe('bytes=100-199');
    expect(fetchSpy.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('does not fetch a private address reached through a redirect', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/admin' },
      }),
    );

    await expect(safeMediaFetch('https://example.com/file')).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('limits redirect chains', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: '/again' },
      }),
    );

    await expect(safeMediaFetch('https://example.com/file'))
      .rejects.toThrow('Too many media redirects.');
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it('does not perform unsafe fetch methods', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(safeMediaFetch('https://example.com/file', { method: 'POST' }))
      .rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
