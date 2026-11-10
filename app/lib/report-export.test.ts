import { describe, expect, it } from 'vitest';

import { mediaReportFilename, mediaReportMimeType } from './report-export';

describe('MediaInfo report export', () => {
  it('saves JSON and text with distinct accurate file extensions', () => {
    expect(mediaReportFilename('Movie.mkv', 'json')).toBe('Movie.mkv.mediainfo.json');
    expect(mediaReportFilename('Movie.mkv', 'text')).toBe('Movie.mkv.mediainfo.txt');
    expect(mediaReportMimeType('json')).toBe('application/json;charset=utf-8');
    expect(mediaReportMimeType('text')).toBe('text/plain;charset=utf-8');
  });

  it('rejects path escapes and filesystem-invalid name characters', () => {
    expect(mediaReportFilename('../../dir/movie?.mp4', 'xml'))
      .toBe('movie_.mp4.mediainfo.xml');
    expect(mediaReportFilename('', 'html')).toBe('media-report.mediainfo.html');
  });

  it('preserves unicode names in locally saved reports', () => {
    expect(mediaReportFilename('বাংলা.mp4', 'json')).toBe('বাংলা.mp4.mediainfo.json');
  });
});
