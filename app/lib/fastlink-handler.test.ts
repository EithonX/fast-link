import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleFastLinkRoutes } from './fastlink-handler';

const origin = 'https://dl.example.com';
const encoded = encodeURIComponent(btoa('https://media.example.com/video.mp4'));
const route = '/p/' + encoded + '/video.mp4';

async function invoke(path: string, init?: RequestInit) {
  const request = new Request(origin + path, init);
  const response = await handleFastLinkRoutes(request, {}, new URL(request.url));
  if (!response) throw new Error('FastLink route was not handled');
  return response;
}

afterEach(() => vi.restoreAllMocks());

describe('FastLink public proxy', () => {
  it('preserves a 206 response and forwards byte ranges', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ab', {
        status: 206,
        headers: {
          'Content-Range': 'bytes 0-1/100',
          'Content-Type': 'video/mp4',
          'Set-Cookie': 'session=secret',
        },
      }),
    );

    const response = await invoke(route, {
      headers: { Range: 'bytes=0-1' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-1/100');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('Range'))
      .toBe('bytes=0-1');
  });

  it('does not invent range support or partial status for a 200 origin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('full file', { status: 200 }),
    );

    const response = await invoke(route, { headers: { Range: 'bytes=1-2' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBeNull();
  });

  it('rejects private hosts before requesting the origin', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const privateUrl = encodeURIComponent(btoa('http://127.0.0.1/admin'));

    const response = await invoke('/p/' + privateUrl + '/secret');
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows preflight but not an arbitrary POST proxy request', async () => {
    expect((await invoke(route, { method: 'OPTIONS' })).status).toBe(200);
    expect((await invoke(route, { method: 'POST', body: 'x' })).status).toBe(405);
  });
});
