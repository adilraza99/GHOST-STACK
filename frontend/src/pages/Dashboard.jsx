import {
  Activity,
  Database,
  Clock,
  Box,
  AlertTriangle,
  Network,
  Rocket,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { useFetch } from '../hooks/useFetch';
import { dashboardApi } from '../services/dashboard';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------------ */
/*  Utility                                                           */
/* ------------------------------------------------------------------ */

function formatUptime(seconds) {
  if (seconds == null) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatTimestamp(iso) {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function severityColor(severity) {
  const map = {
    critical: 'text-rose-400',
    high: 'text-orange-400',
    medium: 'text-amber-400',
    low: 'text-blue-400',
  };
  return map[(severity || '').toLowerCase()] || 'text-zinc-400';
}


/* ------------------------------------------------------------------ */
/*  Health Section                                                    */
/* ------------------------------------------------------------------ */

function HealthSection() {
  const { data, loading, error } = useFetch(dashboardApi.getHealth);

  if (loading) return <LoadingState message="Checking system health…" />;
  if (error) return <ErrorState title="Health Check Failed" message={error.message} />;
  if (!data) return null;

  const isHealthy = data.status === 'healthy';
  const dbConnected = data.database?.state === 'connected';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-500" />
          System Health
        </CardTitle>
        <StatusBadge status={data.status} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* System Status */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              {isHealthy ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-500" />
              )}
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">System</span>
            </div>
            <p className={cn('text-sm font-semibold', isHealthy ? 'text-emerald-400' : 'text-rose-400')}>
              {isHealthy ? 'Operational' : 'Degraded'}
            </p>
          </div>

          {/* Database */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              {dbConnected ? (
                <Database className="h-4 w-4 text-emerald-500" />
              ) : (
                <Database className="h-4 w-4 text-rose-500" />
              )}
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Database</span>
            </div>
            <p className={cn('text-sm font-semibold', dbConnected ? 'text-emerald-400' : 'text-rose-400')}>
              {data.database?.state || 'Unknown'}
            </p>
          </div>

          {/* Uptime */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Uptime</span>
            </div>
            <p className="text-sm font-semibold text-zinc-200">
              {formatUptime(data.uptime)}
            </p>
          </div>

          {/* Version */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Version</span>
            </div>
            <p className="text-sm font-semibold text-zinc-200 font-mono">
              v{data.version || '--'}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{data.environment || '--'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Services Section                                                  */
/* ------------------------------------------------------------------ */

function ServicesSection() {
  const { data, loading, error } = useFetch(dashboardApi.getServices);

  if (loading) return <LoadingState message="Loading services…" />;
  if (error) return <ErrorState title="Failed to load services" message={error.message} />;
  if (!data || data.length === 0) return <EmptyState icon={Box} title="No services" message="No services have been registered yet." />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Box className="h-4 w-4 text-blue-400" />
          Services
        </CardTitle>
        <span className="text-xs font-medium text-zinc-500">{data.length} registered</span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="pb-2 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                <th className="pb-2 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Environment</th>
                <th className="pb-2 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Version</th>
                <th className="pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.map((svc) => (
                <tr key={svc.serviceId} className="border-b border-zinc-800/50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-zinc-200">{svc.name}</td>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {svc.environment || '--'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">{svc.version || '--'}</td>
                  <td className="py-2.5 text-xs text-zinc-500">{formatTimestamp(svc.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Incidents Section                                                 */
/* ------------------------------------------------------------------ */

function IncidentsSection() {
  const { data, loading, error } = useFetch(dashboardApi.getIncidents);

  if (loading) return <LoadingState message="Loading incidents…" />;
  if (error) return <ErrorState title="Failed to load incidents" message={error.message} />;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Incidents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CheckCircle2}
            title="All clear"
            message="No incidents have been detected."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Incidents
        </CardTitle>
        <span className="text-xs font-medium text-zinc-500">{data.length} total</span>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.slice(0, 10).map((incident) => (
            <div
              key={incident.incidentId}
              className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-bold uppercase tracking-wider', severityColor(incident.severity))}>
                    {incident.severity}
                  </span>
                  <StatusBadge status={incident.status} />
                </div>
                <p className="text-sm font-medium text-zinc-200 truncate">{incident.title}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                  <span>Started: {formatTimestamp(incident.startedAt)}</span>
                  {incident.affectedServices && incident.affectedServices.length > 0 && (
                    <span>
                      {incident.affectedServices.length} service{incident.affectedServices.length !== 1 ? 's' : ''} affected
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-mono text-zinc-600 whitespace-nowrap mt-1">
                {incident.incidentId?.slice(0, 8)}
              </span>
            </div>
          ))}
          {data.length > 10 && (
            <p className="text-xs text-zinc-500 text-center pt-2">
              Showing 10 of {data.length} incidents
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Dependency Overview Section                                       */
/* ------------------------------------------------------------------ */

function DependencySection() {
  const { data, loading, error } = useFetch(dashboardApi.getDependencyGraph);

  if (loading) return <LoadingState message="Loading dependency graph…" />;
  if (error) return <ErrorState title="Failed to load dependencies" message={error.message} />;
  if (!data) return null;

  const stats = data.stats || {};
  const edges = data.edges || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Network className="h-4 w-4 text-violet-400" />
          Dependency Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 text-center">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Services</p>
            <p className="text-2xl font-bold text-zinc-100">{stats.nodeCount ?? stats.serviceCount ?? '--'}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 text-center">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Dependencies</p>
            <p className="text-2xl font-bold text-zinc-100">{stats.edgeCount ?? edges.length}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 text-center">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Components</p>
            <p className="text-2xl font-bold text-zinc-100">{stats.components ?? '--'}</p>
          </div>
        </div>
        {edges.length > 0 && (
          <div className="mt-4 max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-1.5 pr-3 font-medium text-zinc-500 uppercase tracking-wider">Source</th>
                  <th className="pb-1.5 pr-3 font-medium text-zinc-500 uppercase tracking-wider">Target</th>
                  <th className="pb-1.5 font-medium text-zinc-500 uppercase tracking-wider">Type</th>
                </tr>
              </thead>
              <tbody>
                {edges.map((edge) => (
                  <tr
                    key={edge.dependencyId || `${edge.sourceServiceId}:${edge.targetServiceId}:${edge.dependencyType}`}
                    className="border-b border-zinc-800/30 last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-zinc-300">{edge.sourceServiceId}</td>
                    <td className="py-1.5 pr-3 text-zinc-300">{edge.targetServiceId}</td>
                    <td className="py-1.5">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        edge.dependencyType === 'sync'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      )}>
                        {edge.dependencyType}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Deployments Section (limitation)                                  */
/* ------------------------------------------------------------------ */

function DeploymentsSection() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-zinc-500" />
          Recent Deployments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
          <Rocket className="h-6 w-6 mb-3 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400 mb-1">Awaiting deployment history API</p>
          <p className="text-xs text-center max-w-xs leading-relaxed">
            Deployment history will appear here when the backend exposes a listing endpoint.
            Currently only deployment creation and analysis are available.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                    */
/* ------------------------------------------------------------------ */

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Health */}
      <HealthSection />

      {/* Summary stats row - fetched independently for resilience */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Services */}
        <ServicesSection />

        {/* Incidents */}
        <IncidentsSection />
      </div>

      {/* Dependency + Deployments */}
      <div className="grid gap-6 md:grid-cols-2">
        <DependencySection />
        <DeploymentsSection />
      </div>
    </div>
  );
}
