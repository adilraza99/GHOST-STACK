import { Menu } from 'lucide-react';

export function Header({ title, onOpenMobileNav }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm px-4 md:px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="p-1.5 -ml-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800/50 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-sm font-semibold text-zinc-100 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-400 bg-zinc-800/50 px-2.5 py-1 rounded-full border border-zinc-700/50 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Live Environment
        </span>
      </div>
    </header>
  );
}
