import { cn } from '../lib/utils';

export function StatusBadge({ status, className }) {
  const normalized = (status || '').toLowerCase();
  
  const variants = {
    healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    down: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    investigating: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    identified: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    mitigated: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    resolved: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  };

  const currentVariant = variants[normalized] || 'bg-zinc-800 text-zinc-300 border-zinc-700';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
        currentVariant,
        className
      )}
    >
      {status}
    </span>
  );
}
