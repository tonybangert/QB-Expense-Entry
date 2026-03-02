import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, BookOpen, KeyRound, Upload, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
      {sub && <p className="mt-3 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/receipts/pending?limit=1'),
      api.get('/api/auth/status'),
      api.get('/api/admin/api-keys'),
    ]).then(([receiptsRes, qbRes, keysRes]) => {
      setStats({
        pendingCount: receiptsRes.status === 'fulfilled'
          ? (receiptsRes.value.receipts?.length > 0 ? receiptsRes.value.total || receiptsRes.value.receipts.length : 0)
          : 0,
        qbConnected: qbRes.status === 'fulfilled' ? qbRes.value.connected : false,
        qbCompany: qbRes.status === 'fulfilled' ? qbRes.value.company : null,
        keyCount: keysRes.status === 'fulfilled'
          ? (keysRes.value.keys || keysRes.value).filter(k => !k.revoked).length
          : 0,
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Welcome back, {user?.username}
        </h2>
        <p className="text-sm text-slate-500">Here's your expense agent overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Inbox}
          label="Pending Receipts"
          value={stats.pendingCount}
          sub="Awaiting review"
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={BookOpen}
          label="QuickBooks"
          value={stats.qbConnected ? 'Connected' : 'Disconnected'}
          sub={stats.qbCompany || 'Not linked'}
          color={stats.qbConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}
        />
        <StatCard
          icon={KeyRound}
          label="Active API Keys"
          value={stats.keyCount}
          sub="For integrations"
          color="bg-indigo-100 text-indigo-600"
        />
      </div>

      <Card title="Quick Actions">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Upload size={16} />
            Upload Receipt
          </Link>
          <Link
            to="/receipts"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Inbox size={16} />
            Review Queue
            <ArrowRight size={14} />
          </Link>
        </div>
      </Card>
    </div>
  );
}
