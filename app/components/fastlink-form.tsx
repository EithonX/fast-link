'use client';

import {
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard as ClipboardIcon,
  Copy,
  Download,
  ExternalLink,
  File,
  Globe,
  HardDrive,
  Info,
  Link2,
  Loader2,
  Moon,
  Sun,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';

import { HistorySheet } from '~/components/history-sheet';
import { MediaView } from '~/components/media-view';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { useHapticFeedback } from '~/hooks/use-haptic';
import { useHistory } from '~/hooks/use-history';

import { ModeToggle } from './mode-toggle';

interface FileInfo {
  filename: string;
  size: number;
  type: string;
}

interface FastLinkState {
  fileInfo: FileInfo | null;
  fastLink: string;
  mediaResults: Record<string, string> | null;
  error: string | null;
  isGenerating: boolean;
  isAnalyzing: boolean;
  url: string;
}

const initialState: FastLinkState = {
  fileInfo: null,
  fastLink: '',
  mediaResults: null,
  error: null,
  isGenerating: false,
  isAnalyzing: false,
  url: '',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return 'Unknown';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '-';
  }
}

export function FastLinkForm() {
  const { triggerSuccess, triggerError } = useHapticFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FastLinkState>(initialState);
  const [copied, setCopied] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const { addToHistory } = useHistory();

  const handleSubmit = async (urlToAnalyze?: string) => {
    const url = urlToAnalyze || inputRef.current?.value?.trim() || '';

    if (!url) {
      setState((s) => ({ ...s, error: 'Please enter a valid URL' }));
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setState((s) => ({
        ...s,
        error: 'URL must start with http:// or https://',
      }));
      return;
    }

    setClipboardUrl(null);

    setState({
      fileInfo: null,
      fastLink: '',
      mediaResults: null,
      error: null,
      isGenerating: true,
      isAnalyzing: false,
      url,
    });

    try {
      const infoResponse = await fetch(`/info?url=${encodeURIComponent(url)}`);
      const infoData = (await infoResponse.json()) as FileInfo & {
        error?: string;
      };

      if (!infoResponse.ok || infoData.error) {
        throw new Error(infoData.error || 'Failed to fetch file info');
      }

      const encodedUrl = btoa(url);
      const fastLink =
        window.location.origin +
        '/p/' +
        encodeURIComponent(encodedUrl) +
        '/' +
        encodeURIComponent(infoData.filename);

      setState((s) => ({
        ...s,
        fileInfo: {
          filename: infoData.filename,
          size: infoData.size,
          type: infoData.type,
        },
        fastLink,
        isGenerating: false,
        isAnalyzing: true,
      }));

      addToHistory({
        url: url,
        fastLink: fastLink,
        filename: infoData.filename,
        fileSize: formatFileSize(infoData.size),
      });

      triggerSuccess();
      fetchMediaInfo(url);
    } catch (err) {
      setState((s) => ({
        ...s,
        isGenerating: false,
        isAnalyzing: false,
        error: err instanceof Error ? err.message : 'Failed to generate link',
      }));
      triggerError();
    }
  };

  const fetchMediaInfo = async (url: string) => {
    try {
      const analyzeResponse = await fetch(
        `/resource/analyze?url=${encodeURIComponent(url)}&format=object`,
      );
      if (analyzeResponse.ok) {
        const analyzeData = (await analyzeResponse.json()) as {
          results?: Record<string, string>;
        };
        setState((s) => ({
          ...s,
          mediaResults: analyzeData.results || null,
          isAnalyzing: false,
        }));
      } else {
        setState((s) => ({ ...s, isAnalyzing: false }));
      }
    } catch {
      setState((s) => ({ ...s, isAnalyzing: false }));
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(state.fastLink);
      setCopied(true);
      triggerSuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      triggerError();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && inputRef.current) {
        inputRef.current.value = text;
        triggerSuccess();
      }
    } catch {
      triggerError();
    }
  };

  const checkClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.startsWith('http') && text !== state.url) {
        setClipboardUrl(text);
      }
    } catch {
      // Clipboard access denied
    }
  };

  const getMediaSummary = () => {
    if (!state.mediaResults?.json) return null;
    try {
      const json = JSON.parse(state.mediaResults.json);
      const tracks = json?.media?.track || [];
      const general = tracks.find(
        (t: Record<string, unknown>) => t['@type'] === 'General',
      );
      const video = tracks.find(
        (t: Record<string, unknown>) => t['@type'] === 'Video',
      );
      const audio = tracks.find(
        (t: Record<string, unknown>) => t['@type'] === 'Audio',
      );

      const items: { label: string; value: string }[] = [];

      if (video?.Width && video?.Height) {
        items.push({ label: 'Resolution', value: `${video.Width}×${video.Height}` });
      }
      if (video?.Format) {
        items.push({ label: 'Video', value: video.Format });
      }
      if (audio?.Format) {
        items.push({ label: 'Audio', value: audio.Format });
      }
      if (general?.Duration) {
        const mins = Math.floor(Number(general.Duration) / 60);
        const secs = Math.floor(Number(general.Duration) % 60);
        items.push({ label: 'Duration', value: `${mins}:${String(secs).padStart(2, '0')}` });
      }
      if (general?.OverallBitRate) {
        items.push({
          label: 'Bitrate',
          value: `${(Number(general.OverallBitRate) / 1000000).toFixed(1)} Mbps`,
        });
      }

      return items.length > 0 ? items : null;
    } catch {
      return null;
    }
  };

  const mediaSummary = getMediaSummary();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <Zap className="text-primary-foreground h-4 w-4" />
            </div>
            <span className="text-lg font-bold">FastLink</span>
          </div>
          <div className="flex items-center gap-2">
            <HistorySheet />
            <ModeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-3xl space-y-8">
          {/* Hero */}
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Fast Download Links
            </h1>
            <p className="text-muted-foreground text-sm">
              Generate accelerated downloads through Cloudflare with media info
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="mx-auto max-w-xl space-y-4"
          >
            {/* Clipboard Suggestion */}
            <AnimatePresence>
              {clipboardUrl && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (inputRef.current) {
                        inputRef.current.value = clipboardUrl;
                      }
                      handleSubmit(clipboardUrl);
                      setClipboardUrl(null);
                    }}
                    className="bg-muted/50 hover:bg-muted group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                  >
                    <ClipboardIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {clipboardUrl}
                    </span>
                    <ArrowRight className="text-muted-foreground group-hover:text-foreground h-4 w-4 shrink-0" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  name="url"
                  type="url"
                  placeholder="https://example.com/file.mp4"
                  autoComplete="off"
                  required
                  onFocus={checkClipboard}
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-11 w-full rounded-lg border px-4 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={handlePaste}
              >
                <ClipboardIcon className="h-4 w-4" />
              </Button>
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={state.isGenerating}
              >
                {state.isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>

          {/* Error */}
          {state.error && !state.isGenerating && (
            <Alert variant="destructive" className="mx-auto max-w-xl">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Loading */}
          {state.isGenerating && (
            <Card className="mx-auto max-w-xl">
              <CardContent className="space-y-4 pt-6">
                <div className="bg-muted h-12 animate-pulse rounded-lg" />
                <div className="flex gap-2">
                  <div className="bg-muted h-10 flex-1 animate-pulse rounded" />
                  <div className="bg-muted h-10 w-20 animate-pulse rounded" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {state.fileInfo && !state.isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="space-y-4 p-4">
                  {/* File Info */}
                  <div className="flex items-start gap-3">
                    <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                      <File className="text-muted-foreground h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">
                        {state.fileInfo.filename}
                      </h3>
                      <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {formatFileSize(state.fileInfo.size)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {getHost(state.url)}
                        </span>
                        {state.fileInfo.type && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {state.fileInfo.type.split('/')[1]?.toUpperCase() || state.fileInfo.type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fast Link */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex-row sm:justify-center">
                      <Link2 className="h-3 w-3" />
                      Fast Link
                    </div>
                    <div className="bg-muted mx-auto max-w-lg rounded-lg border p-3 text-center">
                      <code className="block truncate text-xs sm:text-sm">
                        {state.fastLink}
                      </code>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 pt-1">
                      <Button
                        variant={copied ? 'default' : 'secondary'}
                        size="sm"
                        onClick={copyToClipboard}
                        className="flex-1 gap-2 text-xs sm:flex-none sm:min-w-[100px]"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(state.fastLink, '_blank')}
                        className="flex-1 gap-2 text-xs sm:flex-none sm:min-w-[120px]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const viewerUrl =
                            '/view/' +
                            encodeURIComponent(btoa(state.url)) +
                            '/' +
                            encodeURIComponent(state.fileInfo?.filename || 'file');
                          window.open(viewerUrl, '_blank');
                        }}
                        className="flex-1 gap-2 text-xs sm:flex-none sm:min-w-[100px]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                    </div>
                  </div>

                  {/* Media Summary */}
                  {state.isAnalyzing ? (
                    <div className="flex justify-center items-center gap-2 pt-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing media...
                    </div>
                  ) : mediaSummary ? (
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex-row sm:justify-center">
                        <Info className="h-3 w-3" />
                        Media Info
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {mediaSummary.map((item) => (
                          <Badge key={item.label} variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
                            <span className="text-muted-foreground">{item.label}:</span>
                            <span className="font-medium">{item.value}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Full Details */}
                  {state.mediaResults && (
                    <Accordion type="single" collapsible className="w-full pt-2">
                      <AccordionItem value="details" className="border-t border-b-0 px-1">

                        <AccordionTrigger className="group justify-center py-4 text-xs hover:no-underline text-muted-foreground hover:text-foreground transition-colors [&>svg:last-child]:hidden">
                          <span className="flex items-center gap-1.5">
                            <ChevronDown className="group-data-[state=open]:rotate-180 h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
                            View Full Details
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pt-2">
                            <MediaView data={state.mediaResults} url={state.url} />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <p className="text-muted-foreground text-center text-xs">
          © {new Date().getFullYear()} FastLink
        </p>
      </footer>
    </div>
  );
}
