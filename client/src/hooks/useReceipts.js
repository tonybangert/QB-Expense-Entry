import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/receipts/pending?limit=50');
      setReceipts(data.receipts || []);
      setTotal(data.total ?? (data.receipts?.length || 0));
    } catch {
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const approve = useCallback(async (id, overrides = {}) => {
    await api.post(`/api/receipts/${id}/approve`, overrides);
    await refresh();
  }, [refresh]);

  const reject = useCallback(async (id, reason) => {
    await api.post(`/api/receipts/${id}/reject`, { reason });
    await refresh();
  }, [refresh]);

  return { receipts, total, loading, refresh, approve, reject };
}
