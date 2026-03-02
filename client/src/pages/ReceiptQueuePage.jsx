import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useReceipts } from '../hooks/useReceipts';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import ReceiptDetailModal from './ReceiptDetailModal';
import { Link } from 'react-router-dom';

function confidenceColor(score) {
  if (score >= 0.85) return 'success';
  if (score >= 0.60) return 'warning';
  return 'danger';
}

function confidenceLabel(score) {
  return `${Math.round(score * 100)}%`;
}

export default function ReceiptQueuePage() {
  const { receipts, total, loading, refresh, approve, reject } = useReceipts();
  const [selected, setSelected] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No pending receipts"
        description="Upload a receipt to get started with expense processing."
        action={
          <Link
            to="/upload"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Upload Receipt
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{total} pending receipt{total !== 1 ? 's' : ''}</p>
        <Button variant="ghost" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 font-medium text-slate-500">Vendor</th>
              <th className="px-5 py-3 font-medium text-slate-500">Date</th>
              <th className="px-5 py-3 font-medium text-slate-500 text-right">Amount</th>
              <th className="px-5 py-3 font-medium text-slate-500">Confidence</th>
              <th className="px-5 py-3 font-medium text-slate-500">Category</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {receipts.map((r) => (
              <tr key={r.id} className="transition hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  {r.vendor_name || 'Unknown'}
                </td>
                <td className="px-5 py-3 text-slate-600">{r.date || '—'}</td>
                <td className="px-5 py-3 text-right font-mono text-slate-900">
                  {r.total_amount != null ? `$${Number(r.total_amount).toFixed(2)}` : '—'}
                </td>
                <td className="px-5 py-3">
                  <Badge color={confidenceColor(r.overall_confidence)}>
                    {confidenceLabel(r.overall_confidence)}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-slate-600">{r.suggested_category || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setSelected(r)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReceiptDetailModal
        receipt={selected}
        onClose={() => setSelected(null)}
        onApprove={approve}
        onReject={reject}
      />
    </div>
  );
}
