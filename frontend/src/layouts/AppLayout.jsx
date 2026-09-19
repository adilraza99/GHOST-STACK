import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageContainer } from './PageContainer';

const routeTitles = {
  '/dashboard': 'Dashboard Overview',
  '/services': 'Services Registry',
  '/dependency-graph': 'Dependency Graph',
  '/incidents': 'Incident Intelligence',
  '/deployments': 'Deployment Analysis',
  '/demo': 'Demo Simulator',
};

export function AppLayout() {
  const location = useLocation();
  const title = routeTitles[location.pathname] || 'GhostStack';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden text-zinc-100 font-sans selection:bg-emerald-500/30">
      <Sidebar mobileNavOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header title={title} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <PageContainer>
          <Outlet />
        </PageContainer>
      </div>
    </div>
  );
}
