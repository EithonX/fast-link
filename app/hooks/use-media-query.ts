import { useCallback, useSyncExternalStore } from 'react';

const getServerSnapshot = () => false;

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (
        typeof window === 'undefined' ||
        typeof window.matchMedia !== 'function'
      ) {
        return () => {};
      }

      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', onStoreChange);

      return () => mediaQuery.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false;
    }

    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
