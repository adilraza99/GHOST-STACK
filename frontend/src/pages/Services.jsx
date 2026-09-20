import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  Database,
  ExternalLink,
  Layers,
  Network,
  Activity,
  AlertTriangle,
  Rocket,
  Search,
  Filter,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  RotateCcw,
  X,
  Copy,
  Check,
  Box,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { serviceApi } from '../services/services';
import { cn } from '../lib/utils';

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

function getServiceIcon(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('mongo') || lower.includes('db') || lower.includes('database') || lower.includes('redis')) {
    return Database;
  }
  if (lower.includes('external') || lower.includes('provider') || lower.includes('thirdparty')) {
    return ExternalLink;
  }
  if (lower.includes('gateway') || lower.includes('ingress') || lower.includes('frontend')) {
    return Layers;
  }
  return Server;
}

export function Services() {
  const navigate = useNavigate();

  // Core Data States
  const [services, setServices] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [envFilter, setEnvFilter] = useState('ALL');

  // Detail Inspector States
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [blastRadius, setBlastRadius] = useState(null);
  const [loadingBlastRadius, setLoadingBlastRadius] = useState(false);
  const [blastRadiusError, setBlastRadiusError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Initial and Refresh Data Fetcher
  const loadAllData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      serviceApi.getServices(),
      serviceApi.getDependencies(),
      serviceApi.getIncidents(),
    ])
      .then(([servicesData, depsData, incidentsData]) => {
        setServices(Array.isArray(servicesData) ? servicesData : []);
        setDependencies(Array.isArray(depsData) ? depsData : []);
        setIncidents(Array.isArray(incidentsData) ? incidentsData : []);
      })
      .catch((err) => {
        setError(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      serviceApi.getServices(),
      serviceApi.getDependencies(),
      serviceApi.getIncidents(),
    ])
      .then(([servicesData, depsData, incidentsData]) => {
        if (!isMounted) return;
        setServices(Array.isArray(servicesData) ? servicesData : []);
        setDependencies(Array.isArray(depsData) ? depsData : []);
        setIncidents(Array.isArray(incidentsData) ? incidentsData : []);
      })
      .catch((err) => {
        if (isMounted) setError(err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Service Lookup Map
  const idToService = useMemo(() => {
    const idMap = new Map();
    services.forEach((s) => {
      if (s.serviceId) idMap.set(s.serviceId, s);
    });
    return idMap;
  }, [services]);

  const resolveServiceName = useCallback(
    (idOrName) => {
      if (!idOrName) return '—';
      if (idToService.has(idOrName)) {
        return idToService.get(idOrName).name;
      }
      return idOrName;
    },
    [idToService]
  );

  // Dependency mapping per service
  const serviceDependenciesMap = useMemo(() => {
    const map = new Map();
    services.forEach((s) => {
      map.set(s.serviceId, {
        incoming: [],
        outgoing: [],
      });
    });

    dependencies.forEach((dep) => {
      if (map.has(dep.targetServiceId)) {
        map.get(dep.targetServiceId).incoming.push(dep);
      }
      if (map.has(dep.sourceServiceId)) {
        map.get(dep.sourceServiceId).outgoing.push(dep);
      }
    });

    return map;
  }, [services, dependencies]);

  // Compute health dynamically for each service based on incident and failure data
  const serviceHealthMap = useMemo(() => {
    const healthMap = new Map();
    const activeIncidents = incidents.filter((i) => i.status !== 'resolved');

    services.forEach((svc) => {
      const deps = serviceDependenciesMap.get(svc.serviceId) || { incoming: [], outgoing: [] };

      // Check for active incident matching this service
      const matchingIncidents = activeIncidents.filter((inc) => {
        const rootMatch = inc.trigger?.serviceName === svc.name;
        const affectedMatch = Array.isArray(inc.affectedServices) && inc.affectedServices.includes(svc.name);
        return rootMatch || affectedMatch;
      });

      if (matchingIncidents.length > 0) {
        const isCritical = matchingIncidents.some(
          (inc) => inc.severity === 'critical' || (inc.trigger?.errorRate ?? 0) >= 0.5
        );
        healthMap.set(svc.serviceId, {
          status: isCritical ? 'down' : 'degraded',
          reason: isCritical
            ? 'Active critical outage / high failure rate'
            : 'Active performance degradation anomaly',
          incidents: matchingIncidents,
        });
      } else {
        // Check if any outgoing dependency is failing
        const hasFailingCallee = deps.outgoing.some(
          (d) => (d.failureCount && d.failureCount > 0) || (d.failureRate && d.failureRate > 0)
        );

        if (hasFailingCallee) {
          healthMap.set(svc.serviceId, {
            status: 'degraded',
            reason: 'Downstream dependency failure observed',
            incidents: [],
          });
        } else {
          healthMap.set(svc.serviceId, {
            status: 'healthy',
            reason: 'All systems nominal',
            incidents: [],
          });
        }
      }
    });

    return healthMap;
  }, [services, incidents, serviceDependenciesMap]);

  // Extract unique environments present in real data
  const availableEnvironments = useMemo(() => {
    const envs = new Set();
    services.forEach((s) => {
      if (s.environment) envs.add(s.environment);
    });
    return Array.from(envs);
  }, [services]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let healthyCount = 0;
    let degradedCount = 0;
    let downCount = 0;

    services.forEach((s) => {
      const h = serviceHealthMap.get(s.serviceId)?.status || 'healthy';
      if (h === 'healthy') healthyCount++;
      else if (h === 'degraded') degradedCount++;
      else if (h === 'down') downCount++;
    });

    return {
      totalServices: services.length,
      healthy: healthyCount,
      degradedDown: degradedCount + downCount,
      totalConnections: dependencies.length,
    };
  }, [services, dependencies, serviceHealthMap]);

  // Filtered Services List
  const filteredServices = useMemo(() => {
    return services.filter((svc) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = svc.name.toLowerCase().includes(q);
        const matchesId = (svc.serviceId || '').toLowerCase().includes(q);
        const matchesEnv = (svc.environment || '').toLowerCase().includes(q);
        const matchesVer = (svc.version || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesEnv && !matchesVer) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        const svcStatus = serviceHealthMap.get(svc.serviceId)?.status || 'healthy';
        if (statusFilter === 'degraded-down') {
          if (svcStatus !== 'degraded' && svcStatus !== 'down') return false;
        } else if (svcStatus !== statusFilter) {
          return false;
        }
      }

      // Environment filter
      if (envFilter !== 'ALL') {
        if (envFilter === 'unassigned') {
          if (svc.environment !== null && svc.environment !== '') return false;
        } else if (svc.environment !== envFilter) {
          return false;
        }
      }

      return true;
    });
  }, [services, searchQuery, statusFilter, envFilter, serviceHealthMap]);

  // Reset all filters callback
  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setEnvFilter('ALL');
  }, []);

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'ALL' || envFilter !== 'ALL';

  // Selected Service Entity
  const selectedService = useMemo(() => {
    if (!selectedServiceId) return null;
    return idToService.get(selectedServiceId) || null;
  }, [selectedServiceId, idToService]);

  const handleSelectService = useCallback((serviceId) => {
    setSelectedServiceId(serviceId);
    setBlastRadius(null);
    setBlastRadiusError(null);
  }, []);

  // Analyze Blast Radius for Selected Service
  const handleAnalyzeBlastRadius = useCallback(
    async (serviceId) => {
      if (!serviceId) return;
      setLoadingBlastRadius(true);
      setBlastRadiusError(null);

      try {
        const result = await serviceApi.getBlastRadius(serviceId);
        setBlastRadius(result);
      } catch (err) {
        setBlastRadiusError(err);
      } finally {
        setLoadingBlastRadius(false);
      }
    },
    []
  );

  // Copy UUID to clipboard
  const handleCopyId = useCallback((id) => {
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Services Registry</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              <Server className="h-3 w-3" />
              Stage 17
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Catalog of all discovered microservices, computed runtime health, inter-service
            connections, and blast radius intelligence.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAllData}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh services from backend"
        >
          <RotateCcw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh Registry
        </button>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Total Services */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total Services
            </span>
            <Server className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              {metrics.totalServices}
            </span>
            <span className="text-xs text-zinc-400">cataloged</span>
          </div>
        </Card>

        {/* Metric 2: Healthy Services */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Healthy
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {metrics.healthy}
            </span>
            <span className="text-xs text-emerald-500/80 font-mono">nominal</span>
          </div>
        </Card>

        {/* Metric 3: Degraded / Down */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Degraded / Down
            </span>
            <AlertTriangle
              className={cn(
                'h-4 w-4',
                metrics.degradedDown > 0 ? 'text-rose-400' : 'text-zinc-400'
              )}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                'text-2xl font-bold font-mono',
                metrics.degradedDown > 0 ? 'text-rose-400' : 'text-zinc-100'
              )}
            >
              {metrics.degradedDown}
            </span>
            <span className="text-xs text-zinc-400">anomalies</span>
          </div>
        </Card>

        {/* Metric 4: Total Connections */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Inter-Service Edges
            </span>
            <Network className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              {metrics.totalConnections}
            </span>
            <span className="text-xs text-purple-400 font-mono">dependencies</span>
          </div>
        </Card>
      </div>

      {/* Main Content Area: Loading / Error / Empty / Grid */}
      {loading ? (
        <Card>
          <CardContent className="py-16">
            <LoadingState message="Discovering registered services and dependencies..." />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12">
            <ErrorState
              title="Failed to Load Services Registry"
              message={error.message}
              onRetry={loadAllData}
            />
          </CardContent>
        </Card>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <EmptyState
              icon={Box}
              title="No services discovered yet"
              message="GhostStack automatically discovers microservices and traces call paths from incoming telemetry. Ingest telemetry or run a simulation to populate the service catalog."
              action={
                <button
                  type="button"
                  onClick={() => navigate('/demo')}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-sm"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Run Demo Scenario
                </button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Search and Filters Toolbar */}
          <Card className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search services by name, UUID, environment, or version..."
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 pl-9 pr-8 py-2 text-xs text-zinc-200 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    aria-label="Clear search query"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter Buttons */}
                <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      statusFilter === 'ALL'
                        ? 'bg-zinc-800 text-white font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    All Status
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('healthy')}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      statusFilter === 'healthy'
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    Healthy
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('degraded-down')}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      statusFilter === 'degraded-down'
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/50 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    Degraded / Down
                  </button>
                </div>

                {/* Environment Select Filter */}
                {availableEnvironments.length > 0 && (
                  <select
                    value={envFilter}
                    onChange={(e) => setEnvFilter(e.target.value)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Environments</option>
                    {availableEnvironments.map((env) => (
                      <option key={env} value={env}>
                        {env}
                      </option>
                    ))}
                    <option value="unassigned">Unassigned</option>
                  </select>
                )}

                {/* Reset Filters */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Filter status summary */}
            <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800/60 pt-2 px-1">
              <span>
                Showing <strong className="text-zinc-200 font-mono">{filteredServices.length}</strong> of{' '}
                <strong className="text-zinc-200 font-mono">{services.length}</strong> services
              </span>
              {hasActiveFilters && (
                <span className="text-[11px] text-amber-400/90 flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  Active filters applied
                </span>
              )}
            </div>
          </Card>

          {/* Master Service Table */}
          {filteredServices.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={Search}
                  title="No matching services found"
                  message="No services matched your active search or filter criteria. Try resetting your filters."
                  action={
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
                    >
                      Clear Filters
                    </button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Service Name</th>
                      <th className="py-3 px-4">Runtime Health</th>
                      <th className="py-3 px-4">Environment</th>
                      <th className="py-3 px-4">Version</th>
                      <th className="py-3 px-4">Incoming Callers</th>
                      <th className="py-3 px-4">Outgoing Callees</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/50">
                    {filteredServices.map((svc) => {
                      const Icon = getServiceIcon(svc.name);
                      const health = serviceHealthMap.get(svc.serviceId) || { status: 'healthy', reason: '', incidents: [] };
                      const deps = serviceDependenciesMap.get(svc.serviceId) || { incoming: [], outgoing: [] };
                      const isSelected = selectedServiceId === svc.serviceId;
                      const hasIncidents = health.incidents.length > 0;

                      return (
                        <tr
                          key={svc.serviceId}
                          onClick={() => handleSelectService(svc.serviceId)}
                          className={cn(
                            'group hover:bg-zinc-800/40 transition-colors cursor-pointer',
                            isSelected && 'bg-zinc-800/60 ring-1 ring-emerald-500/30'
                          )}
                        >
                          {/* Service Name & ID */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'p-1.5 rounded-md border',
                                  health.status === 'down'
                                    ? 'bg-rose-950/40 border-rose-800/50 text-rose-400'
                                    : health.status === 'degraded'
                                    ? 'bg-amber-950/40 border-amber-800/50 text-amber-400'
                                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300'
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-100 text-sm flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
                                  {svc.name}
                                  {hasIncidents && (
                                    <span className="flex h-2 w-2 relative" title="Active Anomaly Detected">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono text-[10px] text-zinc-400">
                                  id: {svc.serviceId.substring(0, 8)}...
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Computed Status */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={health.status} />
                            </div>
                          </td>

                          {/* Environment */}
                          <td className="py-3.5 px-4">
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-300 border border-zinc-700/40">
                              {svc.environment || 'unassigned'}
                            </span>
                          </td>

                          {/* Version */}
                          <td className="py-3.5 px-4 font-mono text-zinc-300">
                            {svc.version ? (
                              <span className="text-zinc-200">{svc.version}</span>
                            ) : (
                              <span className="text-zinc-400">--</span>
                            )}
                          </td>

                          {/* Incoming Callers */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1 text-zinc-300">
                              <ArrowDownLeft className="h-3.5 w-3.5 text-blue-400" />
                              <span className="font-mono font-medium">{deps.incoming.length}</span>
                              <span className="text-zinc-400 text-[11px]">
                                {deps.incoming.length === 1 ? 'caller' : 'callers'}
                              </span>
                            </div>
                          </td>

                          {/* Outgoing Callees */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1 text-zinc-300">
                              <ArrowUpRight className="h-3.5 w-3.5 text-purple-400" />
                              <span className="font-mono font-medium">{deps.outgoing.length}</span>
                              <span className="text-zinc-400 text-[11px]">
                                {deps.outgoing.length === 1 ? 'callee' : 'callees'}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectService(svc.serviceId);
                              }}
                              className={cn(
                                'inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                              )}
                            >
                              Inspect
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Service Detail Inspector Modal / Slide-Over */}
      {selectedService && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-inspector-title"
          className="fixed inset-0 z-50 flex items-center justify-end p-0 sm:p-4"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedServiceId(null)}
          />

          {/* Drawer Panel */}
          <div className="relative flex flex-col h-full sm:h-[94vh] w-full sm:max-w-2xl bg-zinc-950 border-l sm:border sm:rounded-xl border-zinc-800 shadow-2xl z-10 overflow-hidden text-zinc-100">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90">
              <div className="flex items-center gap-3">
                {(() => {
                  const IconComponent = getServiceIcon(selectedService.name);
                  return (
                    <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-emerald-400">
                      <IconComponent className="h-5 w-5" />
                    </div>
                  );
                })()}
                <div>
                  <h2 id="service-inspector-title" className="text-lg font-bold text-zinc-100">
                    {selectedService.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge
                      status={serviceHealthMap.get(selectedService.serviceId)?.status || 'healthy'}
                    />
                    <span className="text-xs text-zinc-400 font-mono">
                      env: {selectedService.environment || 'unassigned'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedServiceId(null)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close Inspector"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body — Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Section 1: Overview & Metadata */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-3">
                  Service Metadata & Identification
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-400 block">Service UUID:</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-zinc-200 break-all text-[11px]">
                        {selectedService.serviceId}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyId(selectedService.serviceId)}
                        className="text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0"
                        title="Copy UUID"
                      >
                        {copiedId === selectedService.serviceId ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-zinc-400 block">Version Tag:</span>
                    <span className="font-mono text-zinc-200 font-medium">
                      {selectedService.version || 'No version set'}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-400 block">Discovered / Registered:</span>
                    <span className="text-zinc-300 font-mono">
                      {formatTimestamp(selectedService.createdAt)}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-400 block">Last Active / Updated:</span>
                    <span className="text-zinc-300 font-mono">
                      {formatTimestamp(selectedService.updatedAt)}
                    </span>
                  </div>
                </div>

                {selectedService.metadata && Object.keys(selectedService.metadata).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 text-xs">
                    <span className="text-zinc-400 block mb-1">Custom Metadata:</span>
                    <pre className="font-mono text-[11px] text-zinc-300 bg-zinc-950 p-2 rounded overflow-x-auto">
                      {JSON.stringify(selectedService.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Section 2: Dependencies Overview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Inter-Service Dependencies
                  </span>
                  <span className="text-[11px] font-mono text-purple-400">
                    {serviceDependenciesMap.get(selectedService.serviceId)?.incoming.length || 0} incoming /{' '}
                    {serviceDependenciesMap.get(selectedService.serviceId)?.outgoing.length || 0} outgoing
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Incoming Callers */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-zinc-800/80">
                        <ArrowDownLeft className="h-4 w-4 text-blue-400" />
                        <span className="text-xs font-medium text-zinc-200">
                          Incoming Callers (Upstream)
                        </span>
                      </div>

                      {(() => {
                        const incoming = serviceDependenciesMap.get(selectedService.serviceId)?.incoming || [];
                        if (incoming.length === 0) {
                          return (
                            <p className="text-xs text-zinc-400 py-3 italic">
                              No incoming callers. This is an ingress or client-facing service.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            {incoming.map((dep) => {
                              const callerName = resolveServiceName(dep.sourceServiceId);
                              const isFailing = dep.failureCount > 0;
                              return (
                                <div
                                  key={dep.dependencyId}
                                  onClick={() => handleSelectService(dep.sourceServiceId)}
                                  className="rounded border border-zinc-800 bg-zinc-950 p-2.5 text-xs hover:border-blue-500/50 hover:bg-zinc-900/80 transition-all cursor-pointer"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-zinc-200 hover:text-blue-400">
                                      {callerName}
                                    </span>
                                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-400 uppercase border border-blue-500/20">
                                      {dep.dependencyType}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mt-1">
                                    <span>Requests: {dep.requestCount}</span>
                                    <span className={isFailing ? 'text-rose-400' : 'text-emerald-400'}>
                                      Failures: {dep.failureCount} ({Math.round((dep.failureRate || 0) * 100)}%)
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Outgoing Callees */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-zinc-800/80">
                        <ArrowUpRight className="h-4 w-4 text-purple-400" />
                        <span className="text-xs font-medium text-zinc-200">
                          Outgoing Callees (Downstream)
                        </span>
                      </div>

                      {(() => {
                        const outgoing = serviceDependenciesMap.get(selectedService.serviceId)?.outgoing || [];
                        if (outgoing.length === 0) {
                          return (
                            <p className="text-xs text-zinc-400 py-3 italic">
                              No outgoing dependencies. This is a terminal sink or leaf service.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            {outgoing.map((dep) => {
                              const calleeName = resolveServiceName(dep.targetServiceId);
                              const isFailing = dep.failureCount > 0;
                              return (
                                <div
                                  key={dep.dependencyId}
                                  onClick={() => handleSelectService(dep.targetServiceId)}
                                  className="rounded border border-zinc-800 bg-zinc-950 p-2.5 text-xs hover:border-purple-500/50 hover:bg-zinc-900/80 transition-all cursor-pointer"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-zinc-200 hover:text-purple-400">
                                      {calleeName}
                                    </span>
                                    <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-mono text-purple-400 uppercase border border-purple-500/20">
                                      {dep.dependencyType}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mt-1">
                                    <span>Requests: {dep.requestCount}</span>
                                    <span className={isFailing ? 'text-rose-400' : 'text-emerald-400'}>
                                      Failures: {dep.failureCount} ({Math.round((dep.failureRate || 0) * 100)}%)
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Blast Radius Assessment */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                      Blast Radius Impact Analysis
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Calculate cascading failure risk and upstream dependencies if this service fails.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAnalyzeBlastRadius(selectedService.serviceId)}
                    disabled={loadingBlastRadius}
                    className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 transition-colors shadow-sm disabled:opacity-50 self-start sm:self-auto"
                  >
                    <Network className={cn('h-3.5 w-3.5', loadingBlastRadius && 'animate-spin')} />
                    {loadingBlastRadius ? 'Analyzing...' : 'Analyze Blast Radius'}
                  </button>
                </div>

                {blastRadiusError && (
                  <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 mt-2">
                    {blastRadiusError.message || 'Failed to compute blast radius.'}
                  </div>
                )}

                {blastRadius && (
                  <div className="mt-4 space-y-3 pt-3 border-t border-zinc-800">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded bg-zinc-950 p-2.5 border border-zinc-800">
                        <span className="text-[10px] text-zinc-400 uppercase block">Total Affected</span>
                        <span className="text-base font-bold font-mono text-purple-400">
                          {blastRadius.totalAffectedCount ?? 0} services
                        </span>
                      </div>
                      <div className="rounded bg-zinc-950 p-2.5 border border-zinc-800">
                        <span className="text-[10px] text-zinc-400 uppercase block">Direct Callers</span>
                        <span className="text-base font-bold font-mono text-rose-400">
                          {blastRadius.directlyAffected?.length ?? 0}
                        </span>
                      </div>
                      <div className="rounded bg-zinc-950 p-2.5 border border-zinc-800">
                        <span className="text-[10px] text-zinc-400 uppercase block">Indirect Callers</span>
                        <span className="text-base font-bold font-mono text-amber-400">
                          {blastRadius.indirectlyAffected?.length ?? 0}
                        </span>
                      </div>
                      <div className="rounded bg-zinc-950 p-2.5 border border-zinc-800">
                        <span className="text-[10px] text-zinc-400 uppercase block">Downstream</span>
                        <span className="text-base font-bold font-mono text-blue-400">
                          {blastRadius.downstreamServices?.length ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Directly Affected Chips */}
                    {blastRadius.directlyAffected && blastRadius.directlyAffected.length > 0 && (
                      <div className="text-xs">
                        <span className="text-zinc-400 block mb-1">Directly Affected Callers:</span>
                        <div className="flex flex-wrap gap-1">
                          {blastRadius.directlyAffected.map((id) => (
                            <span
                              key={id}
                              className="rounded bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 text-[11px] font-mono text-rose-300"
                            >
                              {resolveServiceName(id)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Affected Paths */}
                    {blastRadius.affectedPaths && blastRadius.affectedPaths.length > 0 && (
                      <div className="text-xs">
                        <span className="text-zinc-400 block mb-1">Propagation Execution Paths:</span>
                        <div className="space-y-1 font-mono text-[11px]">
                          {blastRadius.affectedPaths.map((path, idx) => (
                            <div key={idx} className="rounded bg-zinc-950 p-1.5 border border-zinc-800/80 text-zinc-300">
                              {path.map((nodeId, i) => (
                                <span key={nodeId}>
                                  <span className={nodeId === selectedService.serviceId ? 'text-purple-400 font-bold' : ''}>
                                    {resolveServiceName(nodeId)}
                                  </span>
                                  {i < path.length - 1 && ' → '}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 4: Incident Context */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Incident Intelligence
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {serviceHealthMap.get(selectedService.serviceId)?.incidents.length || 0} active
                  </span>
                </div>

                {(() => {
                  const matchingIncidents = serviceHealthMap.get(selectedService.serviceId)?.incidents || [];
                  if (matchingIncidents.length === 0) {
                    return (
                      <div className="flex items-center gap-2 rounded bg-zinc-950/60 p-3 text-xs text-zinc-400 border border-zinc-800/80">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                        <span>No active incidents detected. Service telemetry is nominal.</span>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2.5">
                      {matchingIncidents.map((inc) => (
                        <div
                          key={inc.incidentId}
                          className="rounded-lg border border-rose-900/40 bg-rose-950/15 p-3 text-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-semibold text-rose-200">{inc.title}</h4>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                Started: {formatTimestamp(inc.startedAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={inc.status} />
                              <span className="rounded bg-rose-900/50 px-1.5 py-0.5 text-[10px] font-mono text-rose-300 uppercase">
                                {inc.severity}
                              </span>
                            </div>
                          </div>

                          {inc.trigger && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-rose-900/30 font-mono text-[11px]">
                              <div>
                                <span className="text-zinc-400 block text-[10px]">Error Rate:</span>
                                <span className="text-rose-300 font-bold">
                                  {Math.round((inc.trigger.errorRate || 0) * 100)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400 block text-[10px]">Avg Latency:</span>
                                <span className="text-zinc-200">
                                  {Math.round(inc.trigger.avgLatency || 0)}ms
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400 block text-[10px]">Events:</span>
                                <span className="text-zinc-200">{inc.trigger.eventCount || 0}</span>
                              </div>
                              <div>
                                <span className="text-zinc-400 block text-[10px]">Failures:</span>
                                <span className="text-rose-300">{inc.trigger.errorCount || 0}</span>
                              </div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-rose-900/30 flex justify-end">
                            <button
                              type="button"
                              onClick={() => navigate('/incidents')}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-300 hover:text-rose-100 transition-colors"
                            >
                              View in Incidents
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Section 5: Pre-Flight Deployment Quick Action */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-950/10 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Rocket className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
                        Pre-Flight Release Simulation
                      </h4>
                      <p className="text-[11px] text-blue-300/80 mt-0.5">
                        Test a proposed SemVer upgrade for {selectedService.name} against callers before deploying.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/deployments')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm self-start sm:self-auto flex-shrink-0"
                  >
                    Analyze Next Release
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
