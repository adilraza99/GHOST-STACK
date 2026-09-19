import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

export function ErrorState({ title = 'Error', message = 'Something went wrong.', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-12 text-zinc-400', className)}>
      <div className="rounded-full bg-rose-500/10 p-3 mb-4">
        <AlertTriangle className="h-6 w-6 text-rose-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200 mb-1">{title}</h3>
      <p className="text-xs text-center max-w-sm leading-relaxed">{message}</p>
    </div>
  );
}
