import { useSyncExternalStore } from 'react';

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
const EMPTY_HISTORY: HistoryItem[] = [];

let cachedSerializedHistory: string | null | undefined;
let cachedHistory = EMPTY_HISTORY;

function getHistorySnapshot(): HistoryItem[] {
  if (typeof window === 'undefined') return EMPTY_HISTORY;

  const serializedHistory = localStorage.getItem(STORAGE_KEY);
  if (serializedHistory === cachedSerializedHistory) return cachedHistory;

  cachedSerializedHistory = serializedHistory;
  if (!serializedHistory) {
    cachedHistory = EMPTY_HISTORY;
    return cachedHistory;
  }

  try {
    cachedHistory = JSON.parse(serializedHistory) as HistoryItem[];
  } catch (error) {
    console.error('Failed to parse history', error);
    cachedHistory = EMPTY_HISTORY;
  }

  return cachedHistory;
}

function subscribeToHistory(onStoreChange: () => void) {
  const updateHistory = () => {
    cachedSerializedHistory = undefined;
    onStoreChange();
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) updateHistory();
  };

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('fastlink_history_update', updateHistory);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('fastlink_history_update', updateHistory);
  };
}

function writeHistory(history: HistoryItem[]) {
  cachedHistory = history;
  cachedSerializedHistory = JSON.stringify(history);
  localStorage.setItem(STORAGE_KEY, cachedSerializedHistory);
  window.dispatchEvent(new Event('fastlink_history_update'));
}

export function useHistory() {
  const history = useSyncExternalStore(
    subscribeToHistory,
    getHistorySnapshot,
    () => EMPTY_HISTORY,
  );

  const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const newItem: HistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    const filtered = getHistorySnapshot().filter(
      (entry) => entry.url !== item.url,
    );
    writeHistory([newItem, ...filtered].slice(0, MAX_ITEMS));
  };

  const removeFromHistory = (id: string) => {
    writeHistory(getHistorySnapshot().filter((item) => item.id !== id));
  };

  const clearHistory = () => {
    cachedHistory = EMPTY_HISTORY;
    cachedSerializedHistory = null;
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('fastlink_history_update'));
  };

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
