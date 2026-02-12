import path from 'node:path';

import { DiagnosticsError } from '~/lib/error-utils';
import {
  getEmulationHeaders,
  isArchiveExtension,
  resolveGoogleDriveUrl,
  validateUrl,
} from '~/lib/server-utils';
import { fastLinkEmitter } from '~/services/event-bus.server';

export interface FetchDiagnostics {
  headRequestDurationMs: number;
  fetchRequestDurationMs: number;
  totalDurationMs: number;
  isGoogleDrive: boolean;
  resolvedFilename: string;
  innerFilename?: string;
  responseStatus: number;
  probeMethod: string;
  sha256?: string;
  isArchive: boolean;
  isZipCompressed: boolean;
}

export interface MediaFetchResult {
  buffer: Uint8Array;
  filename: string;
  fileSize: number;
  diagnostics: FetchDiagnostics;
}

export async function fetchMediaChunk(
  initialUrl: string,
  chunkSize: number = 2 * 1024 * 1024, // 2MB - enough for container headers/metadata
): Promise<MediaFetchResult> {
  const tStart = performance.now();
  const diagnostics: Partial<FetchDiagnostics> = {};

  const { url: targetUrl, isGoogleDrive } = resolveGoogleDriveUrl(initialUrl);
  diagnostics.isGoogleDrive = isGoogleDrive;

  validateUrl(targetUrl);

  // 1. Initial Request (HEAD with fallback to GET)
  const tHead = performance.now();
  let probeMethod = 'HEAD';
  let headRes = await fetch(targetUrl, {
    method: 'HEAD',
    headers: getEmulationHeaders(),
    redirect: 'follow',
  });

  // If HEAD is not allowed (405), fallback to a GET request for the first byte
  if (headRes.status === 405) {
    probeMethod = 'GET';
    headRes = await fetch(targetUrl, {
      method: 'GET',
      headers: getEmulationHeaders('bytes=0-0'),
      redirect: 'follow',
    });
  }

  diagnostics.headRequestDurationMs = Math.round(performance.now() - tHead);
  diagnostics.probeMethod = probeMethod;

  // Check for HTML content (indicates a webpage, not a direct file link)
  const contentType = headRes.headers.get('content-type');
  if (contentType?.includes('text/html')) {
    // If it's Google Drive, it might be the rate-limit page
    if (isGoogleDrive) {
      throw new Error(
        'Google Drive file is rate-limited. Try again in 24 hours.',
      );
    }

    // If we have a 405, it might be that the server returned an HTML error page for HEAD,
    // but code above should have handled the fallback. If we are here, even the fallback/original returned HTML.
    throw new Error(
      'URL links to a webpage, not a media file. Provide a direct link.',
    );
  }

  if (!headRes.ok) {
    if (headRes.status === 404) {
      throw new Error('Media file not found. Check the URL.');
    } else if (headRes.status === 403) {
      throw new Error(
        'Access denied. The link may have expired or requires authentication.',
      );
    } else {
      throw new Error(`Unable to access file (HTTP ${headRes.status}).`);
    }
  }

  // Determine file size (support Content-Range for partial content responses)
  let fileSize = 0;
  const contentRange = headRes.headers.get('content-range');
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) {
      fileSize = parseInt(match[1], 10);
    }
  }

  // Fallback to Content-Length if no Content-Range
  if (!fileSize) {
    fileSize = parseInt(headRes.headers.get('content-length') ?? '0', 10);
  }

  if (!fileSize) throw new Error('Could not determine file size');

  // 2. Determine Filename
  let filename = targetUrl;
  const contentDisposition = headRes.headers.get('content-disposition');
  if (contentDisposition) {
    const starMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (starMatch && starMatch[1]) {
      try {
        filename = decodeURIComponent(starMatch[1]);
      } catch {
        // failed to decode, keep original
      }
    } else {
      const normalMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      if (normalMatch && normalMatch[1]) {
        filename = normalMatch[1];
      }
    }
  }
  diagnostics.resolvedFilename = filename;

  // Determine if the file is an archive by extension
  const ext = path.posix.extname(filename).toLowerCase();
  const isArchive = isArchiveExtension(ext);

  // 3. Fetch Content Chunk
  const fetchEnd = Math.min(chunkSize - 1, fileSize - 1);

  const tFetch = performance.now();
  const response = await fetch(targetUrl, {
    headers: getEmulationHeaders(`bytes=0-${fetchEnd}`),
    redirect: 'follow',
  });
  diagnostics.fetchRequestDurationMs = Math.round(performance.now() - tFetch);
  diagnostics.responseStatus = response.status;

  const SAFE_LIMIT = 10 * 1024 * 1024; // 10MB "Eco Mode" limit
  const tempBuffer = new Uint8Array(SAFE_LIMIT); // Pre-allocate: Zero GC overhead
  let offset = 0;

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Failed to retrieve response body stream');

  // Check for Zip Header to transparently decompress Deflate streams
  // Only decompress if the file extension indicates an archive format
  const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];

  // Read with a timeout to avoid hanging on misbehaving servers
  const STREAM_TIMEOUT_MS = 30_000;
  let firstChunk: Uint8Array | null = null;
  {
    const readPromise = reader.read();
    const timeoutPromise = new Promise<{ done: true; value: undefined }>(
      (_, reject) =>
        setTimeout(
          () => reject(new Error('Stream read timeout')),
          STREAM_TIMEOUT_MS,
        ),
    );
    const { done, value } = await Promise.race([
      readPromise,
      timeoutPromise,
    ]);
    if (!done && value) {
      firstChunk = value;
    }
  }

  let finalReader = reader;
  let isZipCompressed = false;
  let innerFilename: string | undefined;

  // Verify Zip Signature (only for archive files)
  if (
    isArchive &&
    firstChunk &&
    firstChunk.length > 30 &&
    firstChunk[0] === ZIP_SIG[0] &&
    firstChunk[1] === ZIP_SIG[1] &&
    firstChunk[2] === ZIP_SIG[2] &&
    firstChunk[3] === ZIP_SIG[3]
  ) {
    // Check compression method at offset 8 (2 bytes, little endian)
    const compressionMethod = firstChunk[8] | (firstChunk[9] << 8);

    // Method 8 is DEFLATE. Method 0 is STORED.
    if (compressionMethod === 8) {
      // Zip Deflate detected: Create a DecompressionStream to unzip on-the-fly.
      isZipCompressed = true;

      // Parse local file header to find where the compressed data starts
      const fileNameLength = firstChunk[26] | (firstChunk[27] << 8);
      const extraFieldLength = firstChunk[28] | (firstChunk[29] << 8);
      const dataOffset = 30 + fileNameLength + extraFieldLength;

      // Capture inner filename from zip header
      if (fileNameLength > 0) {
        const nameBytes = firstChunk.subarray(30, 30 + fileNameLength);
        innerFilename = new TextDecoder().decode(nameBytes);
      }

      // Ensure we have enough data in the first chunk to strip the header
      if (firstChunk.length > dataOffset) {
        const dataInFirstChunk = firstChunk.subarray(dataOffset);

        // 1. Create a stream that emits the rest of the first chunk (minus header) + the original stream
        const rawCompressedStream = new ReadableStream({
          start(controller) {
            if (dataInFirstChunk.byteLength > 0) {
              controller.enqueue(dataInFirstChunk);
            }
          },
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(value);
            }
          },
          cancel() {
            reader.cancel();
          },
        });

        // 2. Pipe through DecompressionStream to get raw media data
        const decompressor = new DecompressionStream('deflate-raw');
        finalReader = rawCompressedStream.pipeThrough(decompressor).getReader();

        // firstChunk is now consumed by the new stream pipeline
        firstChunk = null;
      }
    }
  }

  try {
    // If strict zip decompression was not applied (not zip, or stored zip, or error),
    // process the pending firstChunk manually.
    if (firstChunk) {
      const spaceLeft = SAFE_LIMIT - offset;
      if (firstChunk.byteLength > spaceLeft) {
        tempBuffer.set(firstChunk.subarray(0, spaceLeft), offset);
        offset += spaceLeft;

        // If buffer full from just the first chunk, close the original reader.
        // We only cancel the original reader if we didn't upgrade to a decompression pipeline,
        // because the decompression pipeline manages the original reader's lifecycle.
        if (!isZipCompressed) await reader.cancel();
      } else {
        tempBuffer.set(firstChunk, offset);
        offset += firstChunk.byteLength;
      }
    }

    // Now read the rest
    if (offset < SAFE_LIMIT) {
      while (true) {
        const { done, value } = await finalReader.read();
        if (done) break;

        const spaceLeft = SAFE_LIMIT - offset;

        if (value.byteLength > spaceLeft) {
          tempBuffer.set(value.subarray(0, spaceLeft), offset);
          offset += spaceLeft;
          await finalReader.cancel();
          break;
        } else {
          tempBuffer.set(value, offset);
          offset += value.byteLength;
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // DecompressionStream throws if the stream ends while expecting more data (valid for partial fetches)
    if (
      offset > 0 &&
      (errorMessage.includes('incomplete data') ||
        errorMessage.includes('unexpected end of file'))
    ) {
      // We got some data before the stream ended/failed, which is expected for partial zip chunks.
      // Sallow the error and return what we have.
    } else {
      // Stream failed really, propagate error to be caught by main handler
      throw new Error(`Stream reading failed: ${errorMessage}`);
    }
  }

  // Create a view of the actual data we read (no copy)
  const fileBuffer = tempBuffer.subarray(0, offset);

  // Generate SHA-256 integrity hash
  let sha256: string | undefined;
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    sha256 = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Digest not critical, ignore in edge environments
  }

  diagnostics.totalDurationMs = Math.round(performance.now() - tStart);
  diagnostics.sha256 = sha256;
  diagnostics.isArchive = isArchive;
  diagnostics.isZipCompressed = isZipCompressed;
  if (innerFilename) diagnostics.innerFilename = innerFilename;

  const result: MediaFetchResult = {
    buffer: fileBuffer,
    filename: innerFilename ?? filename,
    fileSize,
    diagnostics: diagnostics as FetchDiagnostics,
  };

  // Emit fetch completion event
  fastLinkEmitter.emit('fetch:complete', {
    filename: result.filename,
    fileSize,
    sha256,
    isArchive,
    isZipCompressed,
    durationMs: diagnostics.totalDurationMs,
  });

  return result;
}
