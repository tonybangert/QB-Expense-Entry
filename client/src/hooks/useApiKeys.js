import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useApiKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/api-keys');
      setKeys(data.keys || data);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createKey = useCallback(async (label) => {
    const data = await api.post('/api/admin/api-keys', { label });
    await refresh();
    return data; // contains the full key (shown once)
  }, [refresh]);

  const revokeKey = useCallback(async (id) => {
    await api.del(`/api/admin/api-keys/${id}`);
    await refresh();
  }, [refresh]);

  return { keys, loading, refresh, createKey, revokeKey };
}
