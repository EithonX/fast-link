import { Download, ExternalLink, Link2, Play, X, Zap } from 'lucide-react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useLoaderData, useNavigate } from 'react-router';

import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';

interface LoaderData {
  encoded: string;
  filename: string;
  contentType: string;
  fileSize: string;
  proxyUrl: string;
  originalUrl: string;
  mediaType: 'video' | 'audio' | 'image' | 'pdf' | 'unknown';
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data?.filename ? `${data.filename} - FastLink` : 'Preview - FastLink' },
    { name: 'description', content: 'Preview media file' },
  ];
};

export async function loader({ params, request }: LoaderFunctionArgs): Promise<LoaderData> {
  const encoded = params.encoded || '';
  const filename = params.filename ? decodeURIComponent(params.filename) : 'file';

  let originalUrl = '';
  try {
    originalUrl = atob(decodeURIComponent(encoded));
  } catch {
    throw new Response('Invalid URL', { status: 400 });
  }

  const url = new URL(request.url);
  const proxyUrl = `${url.origin}/p/${encoded}/${encodeURIComponent(filename)}`;

  let contentType = '';
  let fileSize = '';
  try {
    const infoResponse = await fetch(
      `${url.origin}/info?url=${encodeURIComponent(originalUrl)}`,
    );
    if (infoResponse.ok) {
      const info = (await infoResponse.json()) as {
        type?: string;
        size?: number;
      };
      contentType = info.type || '';
      if (info.size) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        let size = info.size;
        let i = 0;
        while (size >= 1024 && i < sizes.length - 1) {
          size /= 1024;
          i++;
        }
        fileSize = `${size.toFixed(1)} ${sizes[i]}`;
      }
    }
  } catch {
    // Ignore
  }

  let mediaType: LoaderData['mediaType'] = 'unknown';

  // Helper to determine media category from MIME type
  const getCategoryFromType = (type: string): LoaderData['mediaType'] | 'unknown' => {
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'pdf';
    return 'unknown';
  };

  mediaType = getCategoryFromType(contentType);

  // Fallback: If unknown, try to guess from filename extension
  if (mediaType === 'unknown' && filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext) {
      if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'm4v'].includes(ext)) {
        mediaType = 'video';
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
        mediaType = 'audio';
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        mediaType = 'image';
      } else if (ext === 'pdf') {
        mediaType = 'pdf';
      }
    }
  }

  return {
    encoded,
    filename,
    contentType,
    fileSize,
    proxyUrl,
    originalUrl,
    mediaType,
  };
}

export default function PreviewPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex shrink-0 items-center gap-1.5"
            >
              <div className="bg-primary flex h-7 w-7 items-center justify-center rounded-lg sm:h-8 sm:w-8">
                <Zap className="text-primary-foreground h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold sm:text-base break-all line-clamp-2">
                {data.filename}
              </h1>
              <p className="text-muted-foreground text-[10px] sm:text-xs">
                {data.fileSize && `${data.fileSize}`}
                {data.fileSize && data.contentType && ' • '}
                {data.contentType}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(data.proxyUrl, '_blank')}
              className="h-8 gap-1.5 px-2.5 text-xs sm:h-9 sm:px-3"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="h-8 w-8 sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center p-2 sm:p-4">
        {data.mediaType === 'video' && (
          <div className="w-full max-w-5xl">
            <video
              controls
              autoPlay
              playsInline
              className="aspect-video w-full rounded-lg bg-black"
              src={data.proxyUrl}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {data.mediaType === 'audio' && (
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 p-6">
              <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20">
                <Play className="text-muted-foreground h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <p className="text-center text-sm font-medium">{data.filename}</p>
              <audio controls autoPlay className="w-full" src={data.proxyUrl}>
                Your browser does not support the audio tag.
              </audio>
            </CardContent>
          </Card>
        )}

        {data.mediaType === 'image' && (
          <div className="w-full max-w-5xl">
            <img
              src={data.proxyUrl}
              alt={data.filename}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          </div>
        )}

        {data.mediaType === 'pdf' && (
          <iframe
            src={data.proxyUrl}
            className="h-[80vh] w-full max-w-5xl rounded-lg border"
            title={data.filename}
          />
        )}

        {data.mediaType === 'unknown' && (
          <Card className="mx-2 w-full max-w-sm sm:mx-0">
            <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
              <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full sm:h-16 sm:w-16">
                <Link2 className="text-muted-foreground h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div>
                <h2 className="text-sm font-semibold sm:text-base">{data.filename}</h2>
                <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
                  Preview not available
                </p>
                {data.fileSize && (
                  <p className="text-muted-foreground text-xs">
                    Size: {data.fileSize}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => window.open(data.proxyUrl, '_blank')}
                  className="gap-2"
                  size="sm"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(data.originalUrl, '_blank')}
                  className="gap-2"
                  size="sm"
                >
                  <ExternalLink className="h-4 w-4" />
                  Original
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
