import { getEmulationHeaders } from './server-utils';

export interface FileInfo {
  filename: string;
  size: number;
  type: string;
}

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

/**
 * Extract filename from Content-Disposition header
 */
function extractFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return '';

  // Try filename*=UTF-8'' first (RFC 5987)
  const starMatch = contentDisposition.match(
    /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i,
  );
  if (starMatch) {
    const raw = starMatch[1] || starMatch[2] || starMatch[3] || '';
    try {
      return decodeURIComponent(raw).replace(/^["']|["']$/g, '');
    } catch {
      return raw.replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

/**
 * Fetch file metadata via HEAD request with GET fallback
 */
export async function getFileInfo(targetUrl: string): Promise<FileInfo> {
  const headers = getEmulationHeaders();

  let response: Response | undefined;
  try {
    response = await fetch(targetUrl, {
      method: 'HEAD',
      headers,
      redirect: 'follow',
    });
  } catch {
    // Ignore, will try fallback
  }

  let contentLength = response?.headers?.get('content-length');
  let contentDisposition = response?.headers?.get('content-disposition');
  let contentType = response?.headers?.get('content-type') || '';
  let filename = '';

  // If HEAD failed or missing headers, try a tiny GET with Range: bytes=0-0
  if (
    !response ||
    (!response.ok && response.status !== 405) ||
    (!contentLength && !contentType)
  ) {
    try {
      const getResp = await fetch(targetUrl, {
        method: 'GET',
        headers: getEmulationHeaders('bytes=0-0'),
        redirect: 'follow',
      });
      if (getResp.ok) {
        contentLength = contentLength || getResp.headers.get('content-length');
        contentDisposition =
          contentDisposition || getResp.headers.get('content-disposition');
        contentType = contentType || getResp.headers.get('content-type') || '';

        // Try content-range total
        const cr = getResp.headers.get('content-range');
        const totalMatch = cr?.match(/\/(\d+)\s*$/);
        if (totalMatch) contentLength = totalMatch[1];
      }
    } catch {
      // Ignore
    }
  }

  // Extract filename from Content-Disposition
  filename = extractFilename(contentDisposition ?? null);

  // Fallback to URL path
  if (!filename) {
    try {
      const parsedUrl = new URL(targetUrl);
      const pathPart = parsedUrl.pathname.substring(
        parsedUrl.pathname.lastIndexOf('/') + 1,
      );
      if (pathPart) filename = decodeURIComponent(pathPart);
    } catch {
      // Ignore
    }
  }

  if (!filename) filename = 'downloaded_file';

  return {
    filename,
    size: parseInt(contentLength || '0', 10),
    type: contentType,
  };
}
