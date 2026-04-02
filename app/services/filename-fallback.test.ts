import type { ArchiveEntryInspection } from '~/lib/archive-inspection';
import type { MediaInfoResult } from '~/services/mediainfo.server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeMediaBuffer } from '~/services/mediainfo.server';

let mockAnalyzeDataResult: MediaInfoResult = {
  media: {
    track: [{ '@type': 'General' }],
  },
};

const mockInformResult = 'General\n';

vi.mock('~/services/mediainfo-factory.server', () => ({
  createMediaInfo: async () => ({
    options: {
      chunkSize: 0,
      coverData: false,
      format: 'object',
      full: true,
    },
    reset() {},
    async analyzeData() {
      return mockAnalyzeDataResult;
    },
    inform() {
      return mockInformResult;
    },
    close() {},
  }),
}));

const createMockZip = (name: string): Uint8Array => {
  const nameBytes = new TextEncoder().encode(name);
  const header = new Uint8Array(30 + nameBytes.length + 4);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(8, 0, true);
  view.setUint32(18, 4, true);
  view.setUint32(22, 4, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(nameBytes, 30);
  header.set(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]), 30 + nameBytes.length);

  return header;
};

describe('analyzeMediaBuffer filename fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses General.Title when incoming filename came from URL', async () => {
    mockAnalyzeDataResult = {
      media: {
        track: [
          {
            '@type': 'General',
            Title: 'placeholder-title-token',
          },
        ],
      },
    };

    const result = await analyzeMediaBuffer(
      new Uint8Array([0, 1, 2, 3]),
      4,
      'url-token',
      'url',
      ['json'],
    );
    const json = JSON.parse(result.results.json) as MediaInfoResult;
    const generalTrack = json.media?.track?.find(
      (t) => t['@type'] === 'General',
    );

    expect(result.resolvedFilename).toBe('placeholder-title-token');
    expect(result.resolvedFilenameSource).toBe('mediainfo-title');
    expect(generalTrack?.CompleteName).toBe('placeholder-title-token');
    expect(generalTrack?.Archive_Name).toBeUndefined();
  });

  it('falls back to General.Movie when Title is not usable', async () => {
    mockAnalyzeDataResult = {
      media: {
        track: [
          {
            '@type': 'General',
            Title: '   ',
            Movie: 'placeholder-movie-token',
          },
        ],
      },
    };

    const result = await analyzeMediaBuffer(
      new Uint8Array([0, 1, 2, 3]),
      4,
      'url-token',
      'url',
      ['json'],
    );

    expect(result.resolvedFilename).toBe('placeholder-movie-token');
    expect(result.resolvedFilenameSource).toBe('mediainfo-movie');
  });

  it('does not let Title override header-derived filename', async () => {
    mockAnalyzeDataResult = {
      media: {
        track: [
          {
            '@type': 'General',
            Title: 'Should.Not.Win',
          },
        ],
      },
    };

    const result = await analyzeMediaBuffer(
      new Uint8Array([0, 1, 2, 3]),
      4,
      'from-head.mp4',
      'content-disposition-head',
      ['json'],
    );
    const json = JSON.parse(result.results.json) as MediaInfoResult;
    const generalTrack = json.media?.track?.find(
      (t) => t['@type'] === 'General',
    );

    expect(result.resolvedFilename).toBe('from-head.mp4');
    expect(result.resolvedFilenameSource).toBe('content-disposition-head');
    expect(generalTrack?.CompleteName).toBe('from-head.mp4');
  });

  it('keeps archive inner filename ahead of MediaInfo metadata', async () => {
    mockAnalyzeDataResult = {
      media: {
        track: [
          {
            '@type': 'General',
            Title: 'Wrong.Title',
          },
        ],
      },
    };

    const result = await analyzeMediaBuffer(
      createMockZip('inner-video.mkv'),
      64,
      'outer.zip',
      'content-disposition-get',
      ['json'],
    );
    const json = JSON.parse(result.results.json) as MediaInfoResult;
    const generalTrack = json.media?.track?.find(
      (t) => t['@type'] === 'General',
    );

    expect(result.resolvedFilename).toBe('inner-video.mkv');
    expect(result.resolvedFilenameSource).toBe('archive-inner');
    expect(generalTrack?.CompleteName).toBe('inner-video.mkv');
    expect(generalTrack?.Archive_Name).toBe('outer.zip');
  });

  it('adds archive sizing warning when archive size is estimated', async () => {
    mockAnalyzeDataResult = {
      media: {
        track: [{ '@type': 'General' }],
      },
    };

    const archiveEntry: ArchiveEntryInspection = {
      name: 'inner-video.mkv',
      archiveKind: 'zip',
      compression: 'deflate',
      dataOffset: 0,
      sizeStatus: 'estimated',
      sizeSource: 'unknown',
    };

    const result = await analyzeMediaBuffer(
      new Uint8Array([0, 1, 2, 3]),
      999,
      'outer.zip',
      'content-disposition-get',
      ['json'],
      archiveEntry,
    );
    const json = JSON.parse(result.results.json) as MediaInfoResult;
    const generalTrack = json.media?.track?.find(
      (t) => t['@type'] === 'General',
    );

    expect(generalTrack?.Archive_Name).toBe('outer.zip');
    expect(generalTrack?.Archive_Sizing_Status).toBe('estimated');
    expect(generalTrack?.Archive_Sizing_Source).toBe('unknown');
    expect(generalTrack?.Archive_Sizing_Warning).toContain('may be inaccurate');
  });
});
