import { useState } from 'react';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

function confidenceDot(score) {
  if (score >= 0.85) return 'bg-emerald-500';
  if (score >= 0.60) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function ReceiptDetailModal({ receipt, onClose, onApprove, onReject }) {
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  // Editable overrides — user can modify before approving
  const [overrides, setOverrides] = useState({});

  // Reset state when receipt changes
  const open = !!receipt;

  function handleClose() {
    setOverrides({});
    setRejectReason('');
    setShowReject(false);
    onClose();
  }

  async function handleApprove() {
    setLoading(true);
    try {
      await onApprove(receipt.id, overrides);
      handleClose();
    } catch (err) {
      alert(err.message || 'Failed to approve receipt');
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setLoading(true);
    try {
      await onReject(receipt.id, rejectReason.trim());
      handleClose();
    } catch (err) {
      alert(err.message || 'Failed to reject receipt');
    } finally {
      setLoading(false);
    }
  }

  if (!receipt) return null;

  const fc = receipt.field_confidence
    ? (typeof receipt.field_confidence === 'string'
        ? JSON.parse(receipt.field_confidence)
        : receipt.field_confidence)
    : {};

  const fields = [
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'total_amount', label: 'Total', type: 'number', prefix: '$' },
    { key: 'subtotal', label: 'Subtotal', type: 'number', prefix: '$' },
    { key: 'tax_amount', label: 'Tax', type: 'number', prefix: '$' },
    { key: 'tip_amount', label: 'Tip', type: 'number', prefix: '$' },
    { key: 'payment_method', label: 'Payment Method' },
    { key: 'suggested_category', label: 'Category' },
  ];

  return (
    <Modal open={open} onClose={handleClose} title="Review Receipt">
      <div className="space-y-4">
        {/* Overall confidence */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Overall confidence:</span>
          <Badge color={receipt.overall_confidence >= 0.85 ? 'success' : receipt.overall_confidence >= 0.60 ? 'warning' : 'danger'}>
            {Math.round(receipt.overall_confidence * 100)}%
          </Badge>
        </div>

        {/* Editable fields with confidence dots */}
        <div className="space-y-3">
          {fields.map(({ key, label, type, prefix }) => {
            const raw = overrides[key] ?? receipt[key] ?? '';
            const conf = fc[key];
            return (
              <div key={key} className="flex items-center gap-3">
                {conf != null && (
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${confidenceDot(conf)}`} title={`${Math.round(conf * 100)}%`} />
                )}
                <label className="w-28 flex-shrink-0 text-sm text-slate-500">{label}</label>
                <div className="relative flex-1">
                  {prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      {prefix}
                    </span>
                  )}
                  <input
                    type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                    step={type === 'number' ? '0.01' : undefined}
                    value={raw}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className={`w-full rounded-lg border border-slate-300 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Description / notes */}
        {receipt.description && (
          <p className="text-sm text-slate-500 italic">"{receipt.description}"</p>
        )}

        {/* Reject reason input */}
        {showReject && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Rejection reason</label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Duplicate, unreadable, wrong category"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
              autoFocus
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {!showReject ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={() => setShowReject(true)}>Reject</Button>
              <Button variant="primary" size="sm" loading={loading} onClick={handleApprove}>
                Approve & Push to QB
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>Back</Button>
              <Button variant="danger" size="sm" loading={loading} onClick={handleReject}>
                Confirm Reject
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
