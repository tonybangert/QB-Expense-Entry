import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useQuickBooks() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/auth/status');
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(async () => {
    const data = await api.get('/api/auth/connect');
    if (data.authUrl) window.open(data.authUrl, '_blank');
  }, []);

  const disconnect = useCallback(async () => {
    await api.post('/api/auth/disconnect');
    await refresh();
  }, [refresh]);

  return { status, loading, refresh, connect, disconnect };
}
