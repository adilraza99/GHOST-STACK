import { SearchX } from 'lucide-react';
import { cn } from '../lib/utils';

export function EmptyState({ icon: Icon = SearchX, title = 'No results found', message = 'There is no data to display here.', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-12 text-zinc-400 border border-dashed border-zinc-800 rounded-lg', className)}>
      <div className="rounded-full bg-zinc-800/50 p-3 mb-4">
        <Icon className="h-6 w-6 text-zinc-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-300 mb-1">{title}</h3>
      <p className="text-xs text-center max-w-sm">{message}</p>
    </div>
  );
}
