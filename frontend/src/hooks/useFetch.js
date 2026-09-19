import { useState, useEffect } from 'react';

/**
 * Generic data-fetching hook.
 * Wraps an async fetcher function with loading/error/data state.
 *
 * @param {() => Promise<any>} fetcher - Async function that returns data
 * @param {any[]} [deps=[]] - Dependency array for re-fetching
 * @returns {{ data: any, loading: boolean, error: Error|null, refetch: () => void }}
 */
export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const execute = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: execute };
}
