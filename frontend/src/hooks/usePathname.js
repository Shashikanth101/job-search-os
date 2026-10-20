import { useCallback, useEffect, useState } from 'react';

/**
 * Current URL (path and query) with history.pushState navigation; Back/Forward work through popstate, no router dependency.
 * @returns {{pathname: string, search: string, navigate: (to: string, options?: {replace?: boolean}) => void}}
 *   `navigate` accepts a path with an optional query string; `replace` swaps the current history entry.
 */
export function usePathname() {
  const [location, setLocation] = useState({ pathname: window.location.pathname, search: window.location.search });

  useEffect(() => {
    const onPopState = () => setLocation({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    const current = window.location.pathname + window.location.search;
    if (url.pathname + url.search !== current || replace) window.history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search);
    setLocation({ pathname: url.pathname, search: url.search });
    if (!replace && url.pathname !== window.location.pathname) window.scrollTo(0, 0);
  }, []);

  return { ...location, navigate };
}
