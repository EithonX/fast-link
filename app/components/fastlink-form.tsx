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
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';

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
import { type HistoryItem, useHistory } from '~/hooks/use-history';
import { cn } from '~/lib/utils';

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
  const [inputUrl, setInputUrl] = useState('');
  const [state, setState] = useState<FastLinkState>(initialState);
  const [copied, setCopied] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const { addToHistory } = useHistory();

  const isValidUrl = useMemo(() => {
    if (!inputUrl) return false;
    try {
      const u = new URL(inputUrl);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, [inputUrl]);

  const handleSubmit = async (urlToAnalyze?: string) => {
    const url = urlToAnalyze || inputUrl.trim() || '';

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
        sizeBytes: infoData.size,
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
      if (text) {
        setInputUrl(text);
        if (inputRef.current) inputRef.current.value = text;
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
        items.push({
          label: 'Resolution',
          value: `${video.Width}×${video.Height}`,
        });
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
        items.push({
          label: 'Duration',
          value: `${mins}:${String(secs).padStart(2, '0')}`,
        });
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

  const handleRestore = (item: HistoryItem) => {
    setState({
      ...initialState,
      url: item.url,
      fastLink: item.fastLink,
      fileInfo: {
        filename: item.filename,
        size: item.sizeBytes || 0,
        type: 'unknown',
      },
      isGenerating: false,
      isAnalyzing: true, // Re-trigger analysis
      mediaResults: null,
    });

    if (inputRef.current) {
      inputRef.current.value = item.url;
    }
    setInputUrl(item.url);

    triggerSuccess();
    fetchMediaInfo(item.url);
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-[60] w-full border-b backdrop-blur">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <a
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            title="Refresh FastLink"
          >
            <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <Zap className="text-primary-foreground h-4 w-4" />
            </div>
            <span className="text-lg font-bold">FastLink</span>
          </a>
          <div className="flex items-center gap-2">
            <HistorySheet onSelect={handleRestore} />
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
                      setInputUrl(clipboardUrl);
                      if (inputRef.current) {
                        inputRef.current.value = clipboardUrl;
                      }
                      handleSubmit(clipboardUrl);
                      setClipboardUrl(null);
                    }}
                    className="hover:bg-muted/50 group flex w-full max-w-full cursor-pointer flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors"
                  >
                    <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      Link from Clipboard
                    </span>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium break-all">
                        {clipboardUrl}
                      </span>
                      <ArrowRight className="text-muted-foreground group-hover:text-foreground h-4 w-4 shrink-0 -rotate-45 transition-colors group-hover:rotate-0" />
                    </div>
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
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://example.com/file.mp4"
                  autoComplete="off"
                  required
                  onFocus={checkClipboard}
                  className={cn(
                    'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-11 w-full rounded-lg border px-4 pr-10 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                    inputUrl &&
                      !isValidUrl &&
                      'border-destructive focus-visible:ring-destructive',
                  )}
                />
                {inputUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputUrl('');
                      setState(initialState);
                      if (inputRef.current) {
                        inputRef.current.value = '';
                        inputRef.current.focus();
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1/2 right-3 -translate-y-1/2 rounded-sm p-0.5 transition-colors"
                    title="Clear URL"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
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
                disabled={state.isGenerating || (!!inputUrl && !isValidUrl)}
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
                          <Badge
                            variant="secondary"
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {state.fileInfo.type.split('/')[1]?.toUpperCase() ||
                              state.fileInfo.type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fast Link */}
                  <div className="space-y-3 pt-2">
                    <div className="text-muted-foreground flex flex-col items-center gap-1.5 text-xs font-medium sm:flex-row sm:justify-center">
                      <Link2 className="h-3 w-3" />
                      Fast Link
                    </div>
                    <div className="bg-muted mx-auto max-w-lg scrollbar-none overflow-x-auto rounded-lg border p-3 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      <code className="block text-xs whitespace-nowrap select-all sm:text-sm">
                        {state.fastLink}
                      </code>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 pt-1">
                      <Button
                        variant={copied ? 'default' : 'secondary'}
                        size="sm"
                        onClick={copyToClipboard}
                        className="flex-1 gap-2 text-xs sm:min-w-[100px] sm:flex-none"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? 'Copied!' : 'Copy'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(state.fastLink, '_blank')}
                        className="flex-1 gap-2 text-xs sm:min-w-[120px] sm:flex-none"
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
                            encodeURIComponent(
                              state.fileInfo?.filename || 'file',
                            );
                          window.open(viewerUrl, '_blank');
                        }}
                        className="flex-1 gap-2 text-xs sm:min-w-[100px] sm:flex-none"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                    </div>
                  </div>

                  {/* Media Summary */}
                  {state.isAnalyzing ? (
                    <div className="text-muted-foreground flex items-center justify-center gap-2 pt-2 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing media...
                    </div>
                  ) : mediaSummary ? (
                    <div className="space-y-3 pt-2">
                      <div className="text-muted-foreground flex flex-col items-center gap-1.5 text-xs font-medium sm:flex-row sm:justify-center">
                        <Info className="h-3 w-3" />
                        Media Info
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {mediaSummary.map((item) => (
                          <Badge
                            key={item.label}
                            variant="outline"
                            className="gap-1.5 px-2.5 py-1 text-xs"
                          >
                            <span className="text-muted-foreground">
                              {item.label}:
                            </span>
                            <span className="font-medium">{item.value}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Full Details */}
                  {state.mediaResults && (
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full pt-2"
                    >
                      <AccordionItem
                        value="details"
                        className="border-t border-b-0 px-1"
                      >
                        <AccordionTrigger className="group text-muted-foreground hover:text-foreground justify-center py-4 text-xs transition-colors hover:no-underline [&>svg:last-child]:hidden">
                          <span className="flex items-center gap-1.5">
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            View Full Details
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pt-2">
                            <MediaView
                              data={state.mediaResults}
                              url={state.url}
                            />
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
      <footer className="border-t py-6">
        <div className="text-muted-foreground/60 hover:text-muted-foreground container mx-auto flex flex-col items-center justify-center gap-1 text-xs transition-colors sm:flex-row sm:gap-1.5">
          <div className="flex items-center gap-1.5">
            <span>© {new Date().getFullYear()} FastLink</span>
            <span>•</span>
            <span>
              Made by{' '}
              <a
                href="https://github.com/EithonX"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/80 hover:text-foreground font-medium underline-offset-4 transition-colors hover:underline"
              >
                Eithon
              </a>
            </span>
          </div>

          <span className="hidden sm:inline">•</span>

          <div className="flex items-center gap-1.5">
            <span>
              Inspired by{' '}
              <a
                href="https://github.com/luminalreason/mediapeek/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/80 hover:text-foreground font-medium underline-offset-4 transition-colors hover:underline"
              >
                MediaPeek
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
