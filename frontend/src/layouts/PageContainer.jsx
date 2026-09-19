import { cn } from '../lib/utils';

export function PageContainer({ children, className }) {
  return (
    <main className={cn('flex-1 overflow-auto bg-zinc-950 p-6', className)}>
      <div className="mx-auto max-w-7xl space-y-6">
        {children}
      </div>
    </main>
  );
}
