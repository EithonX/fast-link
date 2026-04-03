import { parseContentDispositionFilename } from './filename-resolution';
import { getEmulationHeaders } from './server-utils';

export interface FileInfo {
  filename: string;
  size: number;
  type: string;
}

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const PLACEHOLDER_FILENAME_PATTERNS = [
  /^downloaded_file$/i,
  /^file$/i,
  /^download$/i,
  /^findpath$/i,
  /^\d+:findpath$/i,
];

/**
 * Format bytes to human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function isHtmlContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('text/html');
}

function isPlaceholderFilename(filename: string): boolean {
  const normalized = filename.trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_FILENAME_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

function extractUrlPathFilename(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathPart = parsedUrl.pathname.substring(
      parsedUrl.pathname.lastIndexOf('/') + 1,
    );
    return pathPart ? decodeURIComponent(pathPart) : '';
  } catch {
    return '';
  }
}

function inferMimeTypeFromFilename(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? MIME_TYPES_BY_EXTENSION[ext] : undefined;
}

function parseSize(contentLength: string): number {
  const parsed = parseInt(contentLength || '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function deepProbeFileInfo(
  targetUrl: string,
  currentFilename: string,
): Promise<Partial<FileInfo>> {
  try {
    const { fetchMediaChunk } = await import('~/services/media-fetch.server');
    const fetchResult = await fetchMediaChunk(targetUrl);

    const probeInfo: Partial<FileInfo> = {};
    const fetchedFilename = fetchResult.innerFilename || fetchResult.filename;

    if (fetchResult.fileSize && fetchResult.fileSize > 0) {
      probeInfo.size = fetchResult.fileSize;
    }

    if (fetchedFilename && !isPlaceholderFilename(fetchedFilename)) {
      probeInfo.filename = fetchedFilename;
    }

    const shouldAnalyzeForFilename =
      (!probeInfo.filename || isPlaceholderFilename(probeInfo.filename)) &&
      isPlaceholderFilename(currentFilename);

    if (shouldAnalyzeForFilename) {
      const { analyzeMediaBuffer } = await import('~/services/mediainfo.server');
      const analysis = await analyzeMediaBuffer(
        fetchResult.buffer,
        fetchResult.fileSize,
        fetchedFilename || currentFilename || 'downloaded_file',
        fetchResult.filenameSource,
        ['object'],
        fetchResult.archiveEntry,
        fetchResult.byteSource?.readChunk,
      );

      if (
        analysis.resolvedFilename &&
        !isPlaceholderFilename(analysis.resolvedFilename)
      ) {
        probeInfo.filename = analysis.resolvedFilename;
      }
    }

    return probeInfo;
  } catch {
    return {};
  }
}

/**
 * Fetch file metadata via HEAD/GET requests with deep probe fallback for
 * resolver-style links (for example `.../0:findpath?id=...`).
 */
export async function getFileInfo(targetUrl: string): Promise<FileInfo> {
  const headers = getEmulationHeaders();

  let finalUrl = targetUrl;
  let contentLength = '';
  let contentDisposition = '';
  let contentType = '';

  // First try: HEAD request to original URL (follows redirects)
  try {
    const response = await fetch(targetUrl, {
      method: 'HEAD',
      headers,
      redirect: 'follow',
    });

    if (response.url) {
      finalUrl = response.url;
    }

    if (response.ok) {
      contentLength = response.headers.get('content-length') || '';
      contentDisposition = response.headers.get('content-disposition') || '';
      contentType = response.headers.get('content-type') || '';

      const contentRange = response.headers.get('content-range');
      const totalMatch = contentRange?.match(/\/(\d+)\s*$/);
      if (totalMatch && !contentLength) contentLength = totalMatch[1];
    }
  } catch {
    // Ignore and try fallback probes.
  }

  // Second try: If we have a redirected URL, probe it directly.
  if (finalUrl !== targetUrl && (!contentLength || !contentType)) {
    try {
      const finalResponse = await fetch(finalUrl, {
        method: 'HEAD',
        headers,
        redirect: 'manual',
      });

      if (finalResponse.ok) {
        contentLength =
          contentLength || finalResponse.headers.get('content-length') || '';
        contentDisposition =
          contentDisposition ||
          finalResponse.headers.get('content-disposition') ||
          '';
        contentType = contentType || finalResponse.headers.get('content-type') || '';

        const contentRange = finalResponse.headers.get('content-range');
        const totalMatch = contentRange?.match(/\/(\d+)\s*$/);
        if (totalMatch && !contentLength) contentLength = totalMatch[1];
      }
    } catch {
      // Ignore and try fallback probes.
    }
  }

  // Third try: Range GET often returns reliable content-range totals.
  if (!contentLength || !contentType) {
    try {
      const getResponse = await fetch(finalUrl || targetUrl, {
        method: 'GET',
        headers: getEmulationHeaders('bytes=0-0'),
        redirect: 'follow',
      });

      if (getResponse.ok || getResponse.status === 206) {
        if (getResponse.url) {
          finalUrl = getResponse.url;
        }

        contentLength = contentLength || getResponse.headers.get('content-length') || '';
        contentDisposition =
          contentDisposition ||
          getResponse.headers.get('content-disposition') ||
          '';
        contentType = contentType || getResponse.headers.get('content-type') || '';

        const contentRange = getResponse.headers.get('content-range');
        const totalMatch = contentRange?.match(/\/(\d+)\s*$/);
        if (totalMatch) contentLength = totalMatch[1];
      }
    } catch {
      // Ignore and continue with collected metadata.
    }
  }

  // Resolve filename from headers first, then URL path fallbacks.
  let filename = parseContentDispositionFilename(contentDisposition) || '';
  if (!filename) {
    filename = extractUrlPathFilename(finalUrl);
  }
  if (!filename) {
    filename = extractUrlPathFilename(targetUrl);
  }

  let size = parseSize(contentLength);

  // Deep probe fallback for resolver pages and placeholder-style names.
  const shouldDeepProbe =
    size === 0 || isPlaceholderFilename(filename) || isHtmlContentType(contentType);

  if (shouldDeepProbe) {
    const deepProbe = await deepProbeFileInfo(targetUrl, filename);
    if (deepProbe.filename && !isPlaceholderFilename(deepProbe.filename)) {
      filename = deepProbe.filename;
    }
    if (typeof deepProbe.size === 'number' && deepProbe.size > 0) {
      size = deepProbe.size;
    }
  }

  if (!filename) {
    filename = 'downloaded_file';
  }

  const inferredType = inferMimeTypeFromFilename(filename);
  if ((!contentType || isHtmlContentType(contentType)) && inferredType) {
    contentType = inferredType;
  }

  return {
    filename,
    size,
    type: contentType,
  };
}
