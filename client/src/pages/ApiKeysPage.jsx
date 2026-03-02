import { useState } from 'react';
import { KeyRound, Copy, Check, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { useApiKeys } from '../hooks/useApiKeys';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

export default function ApiKeysPage() {
  const { keys, loading, createKey, revokeKey } = useApiKeys();
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    try {
      const data = await createKey(label.trim());
      setNewKey(data.key);
      setLabel('');
    } catch {
      // error handled by api layer
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    setRevoking(id);
    try {
      await revokeKey(id);
    } finally {
      setRevoking(null);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCloseCreate() {
    setShowCreate(false);
    setNewKey('');
    setLabel('');
    setCopied(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const activeKeys = keys.filter((k) => !k.revoked);
  const revokedKeys = keys.filter((k) => k.revoked);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{activeKeys.length} active key{activeKeys.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Create Key
        </Button>
      </div>

      {activeKeys.length === 0 && revokedKeys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys"
          description="Create an API key to authenticate external integrations."
          action={<Button size="sm" onClick={() => setShowCreate(true)}>Create Key</Button>}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 font-medium text-slate-500">Key</th>
                  <th className="pb-2 font-medium text-slate-500">Label</th>
                  <th className="pb-2 font-medium text-slate-500">Created</th>
                  <th className="pb-2 font-medium text-slate-500">Last Used</th>
                  <th className="pb-2 font-medium text-slate-500">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="py-3 font-mono text-xs text-slate-700">{k.key_prefix}…</td>
                    <td className="py-3 text-slate-900">{k.label || '—'}</td>
                    <td className="py-3 text-slate-500">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="py-3 text-slate-500">{k.last_used ? new Date(k.last_used).toLocaleDateString() : 'Never'}</td>
                    <td className="py-3">
                      <Badge color={k.revoked ? 'danger' : 'success'}>
                        {k.revoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      {!k.revoked && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          className="text-slate-400 transition hover:text-red-500 disabled:opacity-50"
                          title="Revoke"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create key modal */}
      <Modal open={showCreate} onClose={handleCloseCreate} title="Create API Key">
        {!newKey ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. CI/CD Pipeline"
                required
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" type="button" onClick={handleCloseCreate}>Cancel</Button>
              <Button size="sm" type="submit" loading={creating}>Create</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm">Copy this key now. You won't be able to see it again.</p>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800 break-all">
                {newKey}
              </code>
              <button
                onClick={handleCopy}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
              </button>
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleCloseCreate}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
