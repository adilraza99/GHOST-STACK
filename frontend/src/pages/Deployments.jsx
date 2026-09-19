import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Rocket,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  Network,
  Clock,
  RotateCcw,
  Info,
  X,
  Activity,
  Send,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { deploymentApi } from '../services/deployments';
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

function bumpVersion(currentVersion, type) {
  const v = (currentVersion || '1.0.0').replace(/^v/, '');
  const parts = v.split('.').map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);

  if (type === 'major') {
    return `${parts[0] + 1}.0.0`;
  }
  if (type === 'minor') {
    return `${parts[0]}.${parts[1] + 1}.0`;
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

export function Deployments() {
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState(null);

  // Form states
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [newVersion, setNewVersion] = useState('1.1.0');
  const [environment, setEnvironment] = useState('production');

  // Analysis result state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);

  // Record deployment action state
  const [recording, setRecording] = useState(false);
  const [recordNotice, setRecordNotice] = useState(null);

  // Load services list
  const loadServices = useCallback(() => {
    setLoadingServices(true);
    setServicesError(null);
    deploymentApi
      .getServices()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setServices(list);
        if (list.length > 0) {
          setSelectedServiceId((prev) => {
            if (prev && list.some((s) => s.serviceId === prev)) return prev;
            return list[0].serviceId;
          });
          const curr = list[0].version || '1.0.0';
          setNewVersion(bumpVersion(curr, 'minor'));
        }
      })
      .catch((err) => {
        setServicesError(err);
      })
      .finally(() => {
        setLoadingServices(false);
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    deploymentApi
      .getServices()
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : [];
        setServices(list);
        if (list.length > 0) {
          setSelectedServiceId((prev) => {
            if (prev && list.some((s) => s.serviceId === prev)) return prev;
            return list[0].serviceId;
          });
          const curr = list[0].version || '1.0.0';
          setNewVersion(bumpVersion(curr, 'minor'));
        }
      })
      .catch((err) => {
        if (isMounted) setServicesError(err);
      })
      .finally(() => {
        if (isMounted) setLoadingServices(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Map service ID to service entity
  const serviceMap = useMemo(() => {
    const map = new Map();
    services.forEach((s) => map.set(s.serviceId, s));
    return map;
  }, [services]);

  const selectedService = useMemo(() => {
    return serviceMap.get(selectedServiceId) || null;
  }, [serviceMap, selectedServiceId]);

  // Handle service change
  const handleServiceSelect = (svcId) => {
    setSelectedServiceId(svcId);
    const svc = serviceMap.get(svcId);
    if (svc) {
      const curr = svc.version || '1.0.0';
      setNewVersion(bumpVersion(curr, 'minor'));
    }
  };

  // Run deployment analysis
  const handleAnalyze = async () => {
    if (!selectedServiceId || !newVersion.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setRecordNotice(null);
    try {
      const result = await deploymentApi.analyzeDeployment({
        serviceId: selectedServiceId,
        newVersion: newVersion.trim(),
      });
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Run deployment recording
  const handleRecordDeployment = async () => {
    if (!selectedServiceId || !newVersion.trim()) return;
    setRecording(true);
    setRecordNotice(null);
    try {
      const prevVer = selectedService?.version || 'unknown';
      const saved = await deploymentApi.recordDeployment({
        serviceId: selectedServiceId,
        previousVersion: prevVer,
        newVersion: newVersion.trim(),
        environment,
      });
      setRecordNotice({
        type: 'success',
        message: `Deployment registered successfully: ${selectedService?.name || selectedServiceId} → v${saved.newVersion} (ID: ${saved.deploymentId?.slice(0, 8)})`,
      });
    } catch (err) {
      setRecordNotice({
        type: 'error',
        message: err.message || 'Failed to record deployment.',
      });
    } finally {
      setRecording(false);
    }
  };

  // Resolve service name
  const getServiceName = (id) => {
    const svc = serviceMap.get(id);
    return svc?.name || id;
  };

  // Calculate impact assessment
  const impactLevel = useMemo(() => {
    if (!analysisResult) return null;
    const count = analysisResult.totalPotentiallyAffected || 0;
    if (count === 0) {
      return {
        label: 'Low Impact',
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        desc: 'Isolated service or leaf node with no upstream callers dependent on it.',
      };
    }
    if (count <= 2) {
      return {
        label: 'Medium Impact',
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        desc: 'Limited blast radius. Affects immediate direct callers.',
      };
    }
    return {
      label: 'High Impact',
      badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      desc: 'Wide upstream blast radius across multiple critical application services.',
    };
  }, [analysisResult]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Deployment Impact Analysis
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
              <Rocket className="h-3 w-3" />
              Stage 15
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Know what your code can break before you deploy it. Pre-flight dependency impact and propagation analysis.
          </p>
        </div>

        <button
          type="button"
          onClick={loadServices}
          disabled={loadingServices}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
        >
          <RotateCcw className={cn('h-3.5 w-3.5', loadingServices && 'animate-spin')} />
          Refresh Services
        </button>
      </div>

      {/* Record notice banner */}
      {recordNotice && (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-3.5 text-xs transition-all',
            recordNotice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          )}
        >
          <div className="flex items-center gap-2.5">
            {recordNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <span>{recordNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecordNotice(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Configuration Form on top or left */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Deployment Simulation Controller */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-zinc-800 bg-zinc-900/90">
            <CardHeader className="p-5 pb-3 border-b border-zinc-800">
              <CardTitle className="text-base text-zinc-100 flex items-center gap-2">
                <Rocket className="h-4 w-4 text-blue-400" />
                Simulate Proposed Release
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-1">
                Select a service to evaluate upstream dependents, downstream targets, and propagation paths.
              </p>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {loadingServices ? (
                <LoadingState message="Loading registered services…" />
              ) : servicesError ? (
                <ErrorState
                  title="Failed to load services"
                  message={servicesError.message || 'Could not fetch service registry.'}
                />
              ) : (
                <>
                  {/* Target Service Selection */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Target Service
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => handleServiceSelect(e.target.value)}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 font-mono focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    >
                      {services.map((svc) => (
                        <option key={svc.serviceId} value={svc.serviceId}>
                          {svc.name} {svc.version ? `(v${svc.version})` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedService && (
                      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>Current Version:</span>
                        <span className="font-mono text-zinc-300">
                          {selectedService.version ? `v${selectedService.version}` : 'unknown'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* New Version Input with Quick Bump */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-zinc-400">
                        Proposed Release Version
                      </label>
                      <div className="flex items-center gap-1">
                        {['patch', 'minor', 'major'].map((bump) => (
                          <button
                            key={bump}
                            type="button"
                            onClick={() => {
                              const curr = selectedService?.version || '1.0.0';
                              setNewVersion(bumpVersion(curr, bump));
                            }}
                            className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                          >
                            +{bump}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={newVersion}
                      onChange={(e) => setNewVersion(e.target.value)}
                      placeholder="e.g. 1.2.0"
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 font-mono focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>

                  {/* Target Environment */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Target Environment
                    </label>
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    >
                      <option value="production">Production</option>
                      <option value="staging">Staging</option>
                      <option value="development">Development</option>
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={analyzing || !selectedServiceId}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Rocket className={cn('h-3.5 w-3.5', analyzing && 'animate-spin')} />
                      {analyzing ? 'Analyzing Dependency Graph…' : 'Analyze Deployment Impact'}
                    </button>

                    <button
                      type="button"
                      onClick={handleRecordDeployment}
                      disabled={recording || !selectedServiceId}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5 text-zinc-500" />
                      {recording ? 'Registering…' : 'Record Deployment Event'}
                    </button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Educational Note */}
          <Card className="border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-zinc-400 space-y-1">
                <span className="font-semibold text-zinc-300 block">
                  Deterministic Graph Analysis
                </span>
                <p className="leading-relaxed">
                  GhostStack constructs directed execution paths between microservices based on live telemetry. Impact analysis computes the exact upstream dependencies that will experience this release without relying on heuristic risk scores.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Impact Analysis Report */}
        <div className="lg:col-span-8 space-y-4">
          {analyzing ? (
            <LoadingState message="Rebuilding graph topology and computing dependent paths…" />
          ) : analysisError ? (
            <ErrorState
              title="Deployment analysis failed"
              message={analysisError.message || 'Could not analyze proposed deployment.'}
            />
          ) : !analysisResult ? (
            <EmptyState
              icon={Rocket}
              title="No deployment simulation run yet"
              message="Configure a proposed service version release on the left and click 'Analyze Deployment Impact' to evaluate what upstream components might break."
            />
          ) : (
            <>
              {/* Impact Overview Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="p-4">
                    <span className="text-xs font-medium text-zinc-400">Total Affected</span>
                    <div className="mt-1 text-2xl font-bold text-zinc-100 font-mono">
                      {analysisResult.totalPotentiallyAffected}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">Upstream callers</p>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="p-4">
                    <span className="text-xs font-medium text-blue-400">Direct Dependents</span>
                    <div className="mt-1 text-2xl font-bold text-blue-400 font-mono">
                      {analysisResult.directDependents?.length || 0}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">Immediate callers</p>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="p-4">
                    <span className="text-xs font-medium text-amber-400">Indirect Dependents</span>
                    <div className="mt-1 text-2xl font-bold text-amber-400 font-mono">
                      {analysisResult.indirectDependents?.length || 0}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">Transitive callers</p>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="p-4">
                    <span className="text-xs font-medium text-purple-400">Downstream Calls</span>
                    <div className="mt-1 text-2xl font-bold text-purple-400 font-mono">
                      {analysisResult.downstreamDependencies?.length || 0}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">Outgoing targets</p>
                  </CardContent>
                </Card>
              </div>

              {/* Assessment Banner */}
              {impactLevel && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                          impactLevel.badge
                        )}
                      >
                        {impactLevel.label}
                      </span>
                      <span className="text-xs text-zinc-300 font-medium">
                        Release for{' '}
                        <strong className="text-white font-mono">
                          {getServiceName(analysisResult.deployment?.serviceId)}
                        </strong>{' '}
                        (v{analysisResult.deployment?.newVersion})
                      </span>
                    </div>

                    <span className="text-[11px] text-zinc-500 italic">
                      Deterministic dependency analysis
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                    {impactLevel.desc}
                  </p>
                </div>
              )}

              {/* Dependents Breakdown Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Direct Dependents */}
                <Card className="border-zinc-800 bg-zinc-900/70">
                  <CardHeader className="p-4 pb-2 border-b border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-blue-400" />
                        Direct Dependents ({analysisResult.directDependents?.length || 0})
                      </CardTitle>
                      <span className="text-[10px] text-zinc-500 font-mono">1 hop</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    {analysisResult.directDependents && analysisResult.directDependents.length > 0 ? (
                      analysisResult.directDependents.map((depId) => (
                        <div
                          key={depId}
                          className="flex items-center justify-between p-2 rounded-md bg-zinc-950/70 border border-zinc-800/80 text-xs"
                        >
                          <span className="font-mono text-zinc-200 font-medium">
                            {getServiceName(depId)}
                          </span>
                          <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            Immediate Caller
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic py-2">
                        No services directly call this service.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Indirect Dependents */}
                <Card className="border-zinc-800 bg-zinc-900/70">
                  <CardHeader className="p-4 pb-2 border-b border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-amber-400" />
                        Indirect Dependents ({analysisResult.indirectDependents?.length || 0})
                      </CardTitle>
                      <span className="text-[10px] text-zinc-500 font-mono">2+ hops</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    {analysisResult.indirectDependents &&
                    analysisResult.indirectDependents.length > 0 ? (
                      analysisResult.indirectDependents.map((depId) => (
                        <div
                          key={depId}
                          className="flex items-center justify-between p-2 rounded-md bg-zinc-950/70 border border-zinc-800/80 text-xs"
                        >
                          <span className="font-mono text-zinc-200 font-medium">
                            {getServiceName(depId)}
                          </span>
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            Transitive Upstream
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic py-2">
                        No transitive callers detected.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Downstream Dependencies */}
              <Card className="border-zinc-800 bg-zinc-900/70">
                <CardHeader className="p-4 pb-2 border-b border-zinc-800/80">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-purple-400" />
                    Downstream Dependencies ({analysisResult.downstreamDependencies?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {analysisResult.downstreamDependencies &&
                  analysisResult.downstreamDependencies.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.downstreamDependencies.map((depId) => (
                        <span
                          key={depId}
                          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-zinc-300"
                        >
                          <Server className="h-3 w-3 text-zinc-500" />
                          {getServiceName(depId)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      This service does not depend on any downstream services.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Affected Execution Paths */}
              <Card className="border-zinc-800 bg-zinc-900/90">
                <CardHeader className="p-4 pb-2 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                      <Network className="h-4 w-4 text-emerald-400" />
                      Affected Execution Paths ({analysisResult.affectedPaths?.length || 0})
                    </CardTitle>
                    <span className="text-[11px] text-zinc-500">
                      Directed caller-to-target routes
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {analysisResult.affectedPaths && analysisResult.affectedPaths.length > 0 ? (
                    analysisResult.affectedPaths.map((path, pIdx) => (
                      <div
                        key={`path-${pIdx}`}
                        className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800"
                      >
                        <span className="text-[11px] font-mono text-zinc-500 mr-1">
                          Path {pIdx + 1}:
                        </span>
                        {path.map((nodeId, nIdx) => {
                          const isTarget = nIdx === path.length - 1;
                          return (
                            <div key={`${pIdx}-${nodeId}`} className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'font-mono text-xs px-2 py-0.5 rounded border',
                                  isTarget
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 font-bold'
                                    : 'bg-zinc-800/80 text-zinc-300 border-zinc-700'
                                )}
                              >
                                {getServiceName(nodeId)}
                                {isTarget && ' (Deployed)'}
                              </span>
                              {!isTarget && (
                                <ArrowRight className="h-3 w-3 text-zinc-600" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      No multi-hop execution paths traversed by this service.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Deployment Record Audit */}
              {analysisResult.deployment && (
                <Card className="border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 mb-3">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-zinc-500" />
                      Recorded Deployment Simulation Audit
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      ID: {analysisResult.deployment.deploymentId}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Service</span>
                      <span className="text-zinc-200">
                        {getServiceName(analysisResult.deployment.serviceId)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Version Delta</span>
                      <span className="text-zinc-200">
                        {analysisResult.deployment.previousVersion} →{' '}
                        <span className="text-blue-400 font-bold">
                          {analysisResult.deployment.newVersion}
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Timestamp</span>
                      <span className="text-zinc-300">
                        {formatTimestamp(analysisResult.deployment.deployedAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Status</span>
                      <span className="text-emerald-400">Recorded</span>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
