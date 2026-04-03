import { beforeEach, describe, expect, it, vi } from 'vitest';

const { analyzeMediaBufferMock, fetchMediaChunkMock } = vi.hoisted(() => ({
  fetchMediaChunkMock: vi.fn(),
  analyzeMediaBufferMock: vi.fn(),
}));

vi.mock('~/services/media-fetch.server', () => ({
  fetchMediaChunk: fetchMediaChunkMock,
}));

vi.mock('~/services/mediainfo.server', () => ({
  analyzeMediaBuffer: analyzeMediaBufferMock,
}));

import { getFileInfo } from './file-info';

describe('getFileInfo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses direct HEAD metadata when headers are present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            'content-length': '2048',
            'content-disposition': 'attachment; filename="sample-video.mp4"',
            'content-type': 'video/mp4',
          },
        }),
      ),
    );

    const info = await getFileInfo('https://example.com/download');

    expect(info).toEqual({
      filename: 'sample-video.mp4',
      size: 2048,
      type: 'video/mp4',
    });
    expect(fetchMediaChunkMock).not.toHaveBeenCalled();
    expect(analyzeMediaBufferMock).not.toHaveBeenCalled();
  });

  it('falls back to media probe for resolver-style links with placeholder metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=UTF-8',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=UTF-8',
            },
          }),
        ),
    );

    fetchMediaChunkMock.mockResolvedValue({
      buffer: new Uint8Array([0, 1, 2]),
      filename: '0:findpath',
      filenameSource: 'url',
      fileSize: 87654321,
      diagnostics: {},
    } as never);

    analyzeMediaBufferMock.mockResolvedValue({
      results: {},
      diagnostics: {},
      resolvedFilename: 'Majka Mara (2024) - Domaci film 480p 836.mp4',
      resolvedFilenameSource: 'mediainfo-title',
    } as never);

    const info = await getFileInfo(
      'https://testusenet.scloudx.qzz.io/0:findpath?id=abc123',
    );

    expect(fetchMediaChunkMock).toHaveBeenCalledTimes(1);
    expect(analyzeMediaBufferMock).toHaveBeenCalledTimes(1);
    expect(info).toEqual({
      filename: 'Majka Mara (2024) - Domaci film 480p 836.mp4',
      size: 87654321,
      type: 'video/mp4',
    });
  });
});
