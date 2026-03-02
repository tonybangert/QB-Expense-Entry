import { CheckCircle, XCircle, RefreshCw, ExternalLink, Unplug } from 'lucide-react';
import { useQuickBooks } from '../hooks/useQuickBooks';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';

export default function QuickBooksPage() {
  const { status, loading, refresh, connect, disconnect } = useQuickBooks();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const connected = status?.connected;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card title="Connection Status">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${connected ? 'bg-emerald-100' : 'bg-slate-100'}`}>
            {connected
              ? <CheckCircle size={24} className="text-emerald-600" />
              : <XCircle size={24} className="text-slate-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {connected ? 'Connected' : 'Not Connected'}
              </p>
              <Badge color={connected ? 'success' : 'neutral'}>
                {status?.environment || 'sandbox'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              {connected ? status.company : 'Connect to start pushing expenses'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3 border-t border-slate-100 pt-4">
          {connected ? (
            <>
              <Button variant="secondary" size="sm" onClick={refresh}>
                <RefreshCw size={14} />
                Refresh Status
              </Button>
              <Button variant="danger" size="sm" onClick={disconnect}>
                <Unplug size={14} />
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={connect}>
                <ExternalLink size={14} />
                Connect QuickBooks
              </Button>
              <Button variant="ghost" size="sm" onClick={refresh}>
                <RefreshCw size={14} />
                Refresh
              </Button>
            </>
          )}
        </div>
      </Card>

      {connected && (
        <Card title="How it works">
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-600">
            <li>Upload a receipt image on the Upload page</li>
            <li>Claude Vision extracts vendor, amount, date, and category</li>
            <li>Review and approve in the Receipt Queue</li>
            <li>Approved expenses are automatically pushed to QuickBooks</li>
          </ol>
        </Card>
      )}
    </div>
  );
}
