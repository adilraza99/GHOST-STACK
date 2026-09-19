import { Activity, Box, Network, AlertTriangle, Rocket, PlaySquare, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Activity },
  { name: 'Services', href: '/services', icon: Box },
  { name: 'Dependency Graph', href: '/dependency-graph', icon: Network },
  { name: 'Incidents', href: '/incidents', icon: AlertTriangle },
  { name: 'Deployments', href: '/deployments', icon: Rocket },
  { name: 'Demo Simulator', href: '/demo', icon: PlaySquare },
];

export function Sidebar({ mobileNavOpen, onClose }) {
  const sidebarContent = (
    <div className="flex h-full w-64 flex-col bg-zinc-950 border-r border-zinc-800">
      <div className="flex h-14 items-center justify-between px-6 border-b border-zinc-800">
        <span className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
          GhostStack
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-zinc-400 hover:text-white p-1 rounded-md"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-800/50 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'mr-3 h-4 w-4 flex-shrink-0',
                    isActive ? 'text-emerald-500' : 'text-zinc-500 group-hover:text-zinc-300'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600">
        v1.0.0-foundation
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />
          <div className="relative flex flex-col z-10 max-w-[80vw]">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
