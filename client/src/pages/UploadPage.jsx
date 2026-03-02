import { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api';
import DropZone from '../components/ui/DropZone';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';

function confidenceColor(score) {
  if (score >= 0.85) return 'success';
  if (score >= 0.60) return 'warning';
  return 'danger';
}

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  async function handleFile(file) {
    setError('');
    setResult(null);
    setApproved(false);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('receipt', file);
      const data = await api.upload('/api/receipts/upload', form);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleApprove() {
    if (!result?.receipt?.id) return;
    setApproving(true);
    try {
      await api.post(`/api/receipts/${result.receipt.id}/approve`, {});
      setApproved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError('');
    setApproved(false);
  }

  const receipt = result?.receipt;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DropZone onFile={handleFile} disabled={uploading} />

      {uploading && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Spinner size="sm" />
          <span className="text-sm text-slate-600">Analyzing receipt with Claude Vision…</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <AlertCircle size={18} className="text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {receipt && !approved && (
        <Card title="Extraction Results" action={
          <Badge color={confidenceColor(receipt.overall_confidence)}>
            {Math.round(receipt.overall_confidence * 100)}% confidence
          </Badge>
        }>
          <dl className="space-y-2 text-sm">
            {[
              ['Vendor', receipt.vendor_name],
              ['Date', receipt.date],
              ['Total', receipt.total_amount != null ? `$${Number(receipt.total_amount).toFixed(2)}` : null],
              ['Subtotal', receipt.subtotal != null ? `$${Number(receipt.subtotal).toFixed(2)}` : null],
              ['Tax', receipt.tax_amount != null ? `$${Number(receipt.tax_amount).toFixed(2)}` : null],
              ['Payment', receipt.payment_method],
              ['Category', receipt.suggested_category],
            ].filter(([, v]) => v != null).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>

          {receipt.description && (
            <p className="mt-3 text-sm text-slate-500 italic">"{receipt.description}"</p>
          )}

          <div className="mt-4 flex gap-3 border-t border-slate-100 pt-4">
            <Button variant="primary" size="sm" loading={approving} onClick={handleApprove}>
              Approve & Push to QB
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>Upload Another</Button>
          </div>
        </Card>
      )}

      {approved && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <CheckCircle size={20} className="text-emerald-600" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Expense pushed to QuickBooks</p>
            <p className="text-xs text-emerald-600">Receipt has been approved and recorded.</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={handleReset}>
            Upload Another
          </Button>
        </div>
      )}
    </div>
  );
}
