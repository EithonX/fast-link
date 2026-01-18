import { useEffect, useState } from 'react';

export interface HistoryItem {
  id: string;
  url: string;
  fastLink: string;
  filename: string;
  fileSize?: string;
  sizeBytes?: number;
  timestamp: number;
  mediaSummary?: string[]; // e.g. ["1080p", "HEVC"]
}

const STORAGE_KEY = 'fastlink_history';
const MAX_ITEMS = 50;

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const loadHistory = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setHistory(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse history', e);
        }
      } else {
        setHistory([]);
      }
    };

    loadHistory();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadHistory();
      }
    };

    const handleCustomEvent = () => loadHistory();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('fastlink_history_update', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('fastlink_history_update', handleCustomEvent);
    };
  }, []);

  const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const newItem: HistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    setHistory((prev) => {
      // Avoid duplicates based on URL
      const filtered = prev.filter((i) => i.url !== item.url);
      const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('fastlink_history_update'));
      return updated;
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('fastlink_history_update'));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('fastlink_history_update'));
  };

  return {
    history: mounted ? history : [],
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
