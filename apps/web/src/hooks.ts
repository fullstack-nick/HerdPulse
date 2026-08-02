import { useCallback, useEffect, useState } from 'react';
import { graphQL, subscribeToChanges, type Variables } from './api';
import { useSession } from './session';

export function useApiQuery<T>(query: string, variables: Variables, key: string) {
  const { token } = useSession();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await graphQL<T>(query, variables, token));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [query, key, token]); // variables are represented by a stable caller key
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useEffect(() => subscribeToChanges(token, load), [token, load]);
  useEffect(() => {
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);
  return { data, error, loading, reload: load };
}

export async function mutate<T>(query: string, variables: Variables, token: string) {
  return graphQL<T>(query, variables, token);
}
