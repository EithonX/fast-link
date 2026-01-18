import {
  Clock,
  Copy,
  ExternalLink,
  History as HistoryIcon,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Separator } from '~/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { useHistory, type HistoryItem } from '~/hooks/use-history';
import { cn } from '~/lib/utils';

function timeAgo(date: number) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
}

interface HistorySheetProps {
  onSelect?: (item: HistoryItem) => void;
}

export function HistorySheet({ onSelect }: HistorySheetProps) {
  const { history, removeFromHistory, clearHistory } = useHistory();
  const [open, setOpen] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Link copied to clipboard');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <HistoryIcon className="h-[1.2rem] w-[1.2rem] transition-all" />
          <span className="sr-only">Toggle history</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex h-full w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Request History</SheetTitle>
          <SheetDescription>
            Your recently generated download links.
          </SheetDescription>
        </SheetHeader>

        {history.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-full">
              <Clock className="text-muted-foreground h-10 w-10 opacity-50" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">No history yet</h3>
              <p className="text-muted-foreground text-sm max-w-[200px]">
                Generate a download link to see it appear here.
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="flex flex-col gap-4 py-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="bg-muted/30 hover:bg-muted/50 group relative flex flex-col gap-3 rounded-lg border p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-1">
                      <h4 className="font-semibold leading-none break-all pr-8">
                        {item.filename}
                      </h4>
                      <p className="text-muted-foreground text-xs">
                        {timeAgo(item.timestamp)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive absolute top-2 right-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeFromHistory(item.id)}
                      title="Remove from history"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Summary Badges if available */}
                  {item.mediaSummary && item.mediaSummary.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.mediaSummary.map((badge, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-2 pt-1">
                    {onSelect && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 flex-1 gap-1.5 text-xs"
                        onClick={() => {
                          onSelect(item);
                          setOpen(false);
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 gap-1.5 text-xs"
                      onClick={() => copyToClipboard(item.fastLink)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 gap-1.5 text-xs"
                      onClick={() => {
                        const viewerUrl =
                          '/view/' +
                          encodeURIComponent(btoa(item.url)) +
                          '/' +
                          encodeURIComponent(item.filename);
                        window.open(viewerUrl, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {history.length > 0 && (
          <div className="pt-4">
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={() => {
                if (confirm('Are you sure you want to clear your history?')) {
                  clearHistory();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Clear History
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
