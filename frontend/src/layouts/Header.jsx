export function Header({ title }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm px-6 sticky top-0 z-10">
      <h1 className="text-sm font-semibold text-zinc-100">{title}</h1>
      <div className="flex items-center gap-4">
        {/* Placeholder for future header items (e.g. environment selector, refresh button) */}
        <span className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          System Online
        </span>
      </div>
    </header>
  );
}
