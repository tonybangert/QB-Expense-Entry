import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-indigo-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-indigo-500',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  ...props
}) {
  return (
    <button
      disabled={loading || props.disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50',
        variants[variant],
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-2.5 text-base',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
