import clsx from 'clsx';

export default function Card({ title, action, children, className, ...props }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
