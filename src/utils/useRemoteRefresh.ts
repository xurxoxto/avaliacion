import { useEffect } from 'react';

/**
 * Calls `refresh` whenever cloud sync applies remote data to localStorage.
 */
export function useRemoteRefresh(refresh: () => void) {
  useEffect(() => {
    const handler = (evt: Event) => {
      const custom = evt as CustomEvent<{ source?: string }>;
      if (custom.detail?.source === 'remote') refresh();
    };
    window.addEventListener('avaliacion:data-changed', handler);
    return () => window.removeEventListener('avaliacion:data-changed', handler);
  }, [refresh]);
}
