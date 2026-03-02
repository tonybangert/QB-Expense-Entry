import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Inbox, Upload, BookOpen, KeyRound, Receipt } from 'lucide-react';
import clsx from 'clsx';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/receipts', label: 'Receipt Queue', icon: Inbox },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/quickbooks', label: 'QuickBooks', icon: BookOpen },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
];

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-slate-900">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Receipt size={16} />
        </div>
        <span className="text-sm font-semibold text-white">QB Expense</span>
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 px-3">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'border-l-2 border-indigo-500 bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-700 px-5 py-4">
        <p className="text-xs text-slate-500">PerformanceLabs.AI</p>
      </div>
    </aside>
  );
}
