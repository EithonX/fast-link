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
  let finalUrl = targetUrl; // Track the final URL after redirects
  
  let contentLength = '';
  let contentDisposition = '';
  let contentType = '';
  
  // First try: HEAD request to original URL (follows redirects)
  try {
    response = await fetch(targetUrl, {
      method: 'HEAD',
      headers,
      redirect: 'follow',
    });
    // Get the final URL after redirects
    if (response?.url) {
      finalUrl = response.url;
    }
    if (response?.ok) {
      contentLength = response.headers.get('content-length') || '';
      contentDisposition = response.headers.get('content-disposition') || '';
      contentType = response.headers.get('content-type') || '';
      
      // Try content-range for size
      const cr = response.headers.get('content-range');
      const totalMatch = cr?.match(/\/(\d+)\s*$/);
      if (totalMatch && !contentLength) contentLength = totalMatch[1];
    }
  } catch {
    // Ignore, will try fallback
  }

  // Second try: If still missing size/type and we have a different final URL, try HEAD on that
  if (finalUrl !== targetUrl && (!contentLength || !contentType)) {
    try {
      const finalResp = await fetch(finalUrl, {
        method: 'HEAD',
        headers,
        redirect: 'manual', // Don't follow further redirects
      });
      if (finalResp?.ok) {
        contentLength = contentLength || finalResp.headers.get('content-length') || '';
        contentDisposition = contentDisposition || finalResp.headers.get('content-disposition') || '';
        contentType = contentType || finalResp.headers.get('content-type') || '';
        
        const cr = finalResp.headers.get('content-range');
        const totalMatch = cr?.match(/\/(\d+)\s*$/);
        if (totalMatch && !contentLength) contentLength = totalMatch[1];
      }
    } catch {
      // Ignore
    }
  }

  // Third try: If still missing, try a Range GET request
  if (!contentLength || !contentType) {
    try {
      const getResp = await fetch(finalUrl || targetUrl, {
        method: 'GET',
        headers: getEmulationHeaders('bytes=0-0'),
        redirect: 'follow',
      });
      if (getResp.ok || getResp.status === 206) {
        // Update final URL from GET response as well
        if (getResp.url) {
          finalUrl = getResp.url;
        }
        contentLength = contentLength || getResp.headers.get('content-length') || '';
        contentDisposition = contentDisposition || getResp.headers.get('content-disposition') || '';
        contentType = contentType || getResp.headers.get('content-type') || '';

        // Try content-range total - this is often the most reliable for size
        const cr = getResp.headers.get('content-range');
        const totalMatch = cr?.match(/\/(\d+)\s*$/);
        if (totalMatch) contentLength = totalMatch[1];
      }
    } catch {
      // Ignore
    }
  }

  // Extract filename from Content-Disposition
  let filename = extractFilename(contentDisposition || null);

  // Fallback to final URL path (after redirects)
  if (!filename) {
    try {
      const parsedUrl = new URL(finalUrl);
      const pathPart = parsedUrl.pathname.substring(
        parsedUrl.pathname.lastIndexOf('/') + 1,
      );
      if (pathPart) filename = decodeURIComponent(pathPart);
    } catch {
      // Ignore
    }
  }

  // If still no filename, try the original URL as last resort
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

  // Try to infer content type from filename extension if still missing
  if (!contentType && filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'mkv': 'video/x-matroska',
      'webm': 'video/webm',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'mp3': 'audio/mpeg',
      'flac': 'audio/flac',
      'wav': 'audio/wav',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    if (ext && mimeTypes[ext]) {
      contentType = mimeTypes[ext];
    }
  }

  if (!filename) filename = 'downloaded_file';

  return {
    filename,
    size: parseInt(contentLength || '0', 10),
    type: contentType,
  };
}
