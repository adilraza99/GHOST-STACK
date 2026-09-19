import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function LoadingState({ message = 'Loading...', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-12 text-zinc-400', className)}>
      <Loader2 className="h-8 w-8 animate-spin mb-4 text-emerald-500/50" />
      <p className="text-sm font-medium tracking-wide">{message}</p>
    </div>
  );
}
