import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User } from 'lucide-react';

const titles = {
  '/': 'Dashboard',
  '/receipts': 'Receipt Queue',
  '/upload': 'Upload Receipt',
  '/quickbooks': 'QuickBooks',
  '/api-keys': 'API Keys',
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const title = titles[pathname] || 'QB Expense Agent';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <User size={16} />
          <span>{user?.username}</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </header>
  );
}
