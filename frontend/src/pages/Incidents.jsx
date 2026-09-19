import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Activity,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Search,
  RefreshCw,
  GitCommit,
  ShieldAlert,
  CheckCircle2,
  Filter,
  X,
  Radio,
  Server,
  Flame,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { incidentApi } from '../services/incidents';
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

function formatRelativeTime(ms) {
  if (ms === null || ms === undefined) return '0.0s';
  const sign = ms > 0 ? '+' : '';
  const seconds = (ms / 1000).toFixed(1);
  return `${sign}${seconds}s`;
}

function formatDuration(durationMs, startedAt, endedAt) {
  let ms = durationMs;
  if (ms === null || ms === undefined) {
    if (startedAt) {
      const end = endedAt ? new Date(endedAt).getTime() : Date.now();
      ms = Math.max(0, end - new Date(startedAt).getTime());
    } else {
      return 'Ongoing';
    }
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s (${ms}ms)`;
}

function getSeverityBadge(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'high':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'medium':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'low':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    default:
      return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  }
}

function getEventTypeConfig(type) {
  switch ((type || '').toLowerCase()) {
    case 'error':
      return {
        label: 'Error',
        color: 'text-rose-400',
        bg: 'bg-rose-500/15',
        border: 'border-rose-500/30',
        dotBg: 'bg-rose-500',
        dotRing: 'ring-rose-500/30',
        icon: AlertCircle,
      };
    case 'latency_spike':
      return {
        label: 'Latency Spike',
        color: 'text-amber-400',
        bg: 'bg-amber-500/15',
        border: 'border-amber-500/30',
        dotBg: 'bg-amber-500',
        dotRing: 'ring-amber-500/30',
        icon: Clock,
      };
    case 'deployment':
      return {
        label: 'Deployment',
        color: 'text-blue-400',
        bg: 'bg-blue-500/15',
        border: 'border-blue-500/30',
        dotBg: 'bg-blue-500',
        dotRing: 'ring-blue-500/30',
        icon: GitCommit,
      };
    case 'dependency_failure':
      return {
        label: 'Dependency Failure',
        color: 'text-purple-400',
        bg: 'bg-purple-500/15',
        border: 'border-purple-500/30',
        dotBg: 'bg-purple-500',
        dotRing: 'ring-purple-500/30',
        icon: ShieldAlert,
      };
    default:
      return {
        label: type || 'Event',
        color: 'text-zinc-400',
        bg: 'bg-zinc-800',
        border: 'border-zinc-700',
        dotBg: 'bg-zinc-500',
        dotRing: 'ring-zinc-500/30',
        icon: Activity,
      };
  }
}

export function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Detection action state
  const [detecting, setDetecting] = useState(false);
  const [detectionNotice, setDetectionNotice] = useState(null);

  // Timeline replay state
  const [replayData, setReplayData] = useState(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [timelineFilter, setTimelineFilter] = useState('ALL');

  const timelineContainerRef = useRef(null);
  const playTimerRef = useRef(null);

  // Fetch all incidents
  const loadIncidents = useCallback((selectFirst = false) => {
    setLoading(true);
    incidentApi
      .getIncidents()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setIncidents(list);
        setError(null);
        if (list.length > 0) {
          setSelectedIncidentId((prev) => {
            if (!prev || selectFirst || !list.some((i) => i.incidentId === prev)) {
              return list[0].incidentId;
            }
            return prev;
          });
        } else {
          setSelectedIncidentId(null);
        }
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
    incidentApi
      .getIncidents()
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : [];
        setIncidents(list);
        setError(null);
        if (list.length > 0) {
          setSelectedIncidentId((prev) => {
            if (!prev || !list.some((i) => i.incidentId === prev)) {
              return list[0].incidentId;
            }
            return prev;
          });
        } else {
          setSelectedIncidentId(null);
        }
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

  // Fetch replay when selected incident changes
  useEffect(() => {
    if (!selectedIncidentId) {
      return;
    }
    let isMounted = true;
    incidentApi
      .getIncidentReplay(selectedIncidentId)
      .then((data) => {
        if (!isMounted) return;
        setReplayData(data);
        setReplayError(null);
        setIsPlaying(false);
        setActiveStepIndex(0);
      })
      .catch((err) => {
        if (isMounted) setReplayError(err);
      })
      .finally(() => {
        if (isMounted) setReplayLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedIncidentId]);

  // Playback timer effect
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.max(250, Math.floor(1200 / playSpeed));

    playTimerRef.current = setInterval(() => {
      setActiveStepIndex((prevIndex) => {
        const timeline = replayData?.timeline || [];
        if (timeline.length === 0 || prevIndex >= timeline.length - 1) {
          setIsPlaying(false);
          return prevIndex;
        }
        return prevIndex + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playSpeed, replayData]);

  // Trigger manual incident detection
  const handleTriggerDetection = async () => {
    setDetecting(true);
    setDetectionNotice(null);
    try {
      const result = await incidentApi.triggerDetection();
      const detectedCount = result?.detected || 0;
      setDetectionNotice({
        type: detectedCount > 0 ? 'success' : 'info',
        message:
          detectedCount > 0
            ? `Detection completed: ${detectedCount} new incident(s) identified!`
            : 'Detection completed: No anomalies detected in current telemetry window.',
      });
      loadIncidents(detectedCount > 0);
    } catch (err) {
      setDetectionNotice({
        type: 'error',
        message: err.message || 'Incident detection engine failed to execute.',
      });
    } finally {
      setDetecting(false);
    }
  };

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = incident.title?.toLowerCase().includes(q);
        const matchId = incident.incidentId?.toLowerCase().includes(q);
        const matchService = incident.trigger?.serviceName?.toLowerCase().includes(q);
        const matchAffected = incident.affectedServices?.some((s) => s.toLowerCase().includes(q));
        if (!matchTitle && !matchId && !matchService && !matchAffected) return false;
      }

      // Status
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'ACTIVE') {
          if (incident.status === 'resolved') return false;
        } else if (incident.status?.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // Severity
      if (severityFilter !== 'ALL') {
        if (incident.severity?.toLowerCase() !== severityFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [incidents, searchQuery, statusFilter, severityFilter]);

  // Selected incident object
  const selectedIncident = useMemo(() => {
    return incidents.find((i) => i.incidentId === selectedIncidentId) || null;
  }, [incidents, selectedIncidentId]);

  // Filtered timeline events
  const timelineEvents = useMemo(() => {
    const raw = replayData?.timeline || [];
    if (timelineFilter === 'ALL') return raw;
    return raw.filter((ev) => ev.type?.toLowerCase() === timelineFilter.toLowerCase());
  }, [replayData, timelineFilter]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = incidents.length;
    const active = incidents.filter((i) => i.status !== 'resolved').length;
    const criticalOrHigh = incidents.filter(
      (i) => i.severity === 'critical' || i.severity === 'high'
    ).length;
    const resolved = incidents.filter((i) => i.status === 'resolved').length;
    return { total, active, criticalOrHigh, resolved };
  }, [incidents]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Detection Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Incident Intelligence & Timeline Replay
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-400 border border-rose-500/20">
              <Flame className="h-3 w-3" />
              Stage 14
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Automated anomaly detection, root cause correlation, and deterministic event propagation replay.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadIncidents()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh incident list"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleTriggerDetection}
            disabled={detecting}
            className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors shadow-sm disabled:opacity-50"
            title="Manually evaluate recent telemetry and build dependency blast radius"
          >
            <Radio className={cn('h-3.5 w-3.5', detecting && 'animate-pulse')} />
            {detecting ? 'Evaluating Telemetry…' : 'Run Detection Engine'}
          </button>
        </div>
      </div>

      {/* Detection Notice Banner */}
      {detectionNotice && (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-3.5 text-xs transition-all',
            detectionNotice.type === 'success' && 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300',
            detectionNotice.type === 'info' && 'bg-blue-950/40 border-blue-500/30 text-blue-300',
            detectionNotice.type === 'error' && 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          )}
        >
          <div className="flex items-center gap-2.5">
            {detectionNotice.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {detectionNotice.type === 'info' && <Activity className="h-4 w-4 text-blue-400" />}
            {detectionNotice.type === 'error' && <AlertTriangle className="h-4 w-4 text-rose-400" />}
            <span>{detectionNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setDetectionNotice(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-zinc-900/70 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Total Incidents</span>
              <Activity className="h-4 w-4 text-zinc-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-100">{metrics.total}</div>
            <p className="mt-1 text-[11px] text-zinc-500">All recorded anomalies</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-400">Active Incidents</span>
              <Flame className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-400">{metrics.active}</div>
            <p className="mt-1 text-[11px] text-zinc-500">Detected or investigating</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-rose-400">Critical / High</span>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-400">{metrics.criticalOrHigh}</div>
            <p className="mt-1 text-[11px] text-zinc-500">Elevated severity</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-400">Resolved</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">{metrics.resolved}</div>
            <p className="mt-1 text-[11px] text-zinc-500">Recovered & closed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, ID, or service name…"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 pl-9 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400 mr-1">
                <Filter className="h-3.5 w-3.5" />
                <span className="font-medium">Status:</span>
              </div>
              {['ALL', 'ACTIVE', 'DETECTED', 'INVESTIGATING', 'RESOLVED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    statusFilter === st
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                >
                  {st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-zinc-800/60">
            <div className="flex items-center gap-1.5 text-zinc-400 mr-1">
              <Flame className="h-3.5 w-3.5" />
              <span className="font-medium">Severity:</span>
            </div>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  severityFilter === sev
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                )}
              >
                {sev.charAt(0) + sev.slice(1).toLowerCase()}
              </button>
            ))}

            {(searchQuery || statusFilter !== 'ALL' || severityFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setSeverityFilter('ALL');
                }}
                className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Reset filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Layout: Master-Detail Split */}
      {loading ? (
        <LoadingState message="Loading incident telemetry and root-cause events…" />
      ) : error ? (
        <ErrorState
          title="Failed to load incidents"
          message={error.message || 'Unable to connect to incident intelligence API.'}
        />
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No incidents detected"
          message="GhostStack hasn't detected any microservice anomalies. Click 'Run Detection Engine' or use the Demo Simulator to trigger telemetry cascades."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Incidents List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Incidents ({filteredIncidents.length} of {incidents.length})
              </span>
              <span className="text-[11px] text-zinc-500">Sorted by timestamp</span>
            </div>

            {filteredIncidents.length === 0 ? (
              <Card className="p-8 text-center border-dashed border-zinc-800 bg-zinc-900/40">
                <Search className="mx-auto h-6 w-6 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400">No incidents match the active filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setSeverityFilter('ALL');
                  }}
                  className="mt-2 text-xs text-rose-400 hover:underline"
                >
                  Clear all filters
                </button>
              </Card>
            ) : (
              <div className="space-y-2.5 max-h-[780px] overflow-y-auto pr-1">
                {filteredIncidents.map((incident) => {
                  const isSelected = incident.incidentId === selectedIncidentId;
                  const severityClass = getSeverityBadge(incident.severity);

                  return (
                    <div
                      key={incident.incidentId}
                      onClick={() => {
                        setSelectedIncidentId(incident.incidentId);
                        setReplayLoading(true);
                      }}
                      className={cn(
                        'group relative cursor-pointer rounded-lg border p-4 transition-all duration-150',
                        isSelected
                          ? 'border-rose-500/50 bg-zinc-900 shadow-md shadow-rose-950/20 ring-1 ring-rose-500/20'
                          : 'border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
                      )}
                    >
                      {/* Active indicator bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-rose-500" />
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
                              severityClass
                            )}
                          >
                            {incident.severity}
                          </span>
                          <StatusBadge status={incident.status} />
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {formatRelativeTime(incident.durationMs)}
                        </span>
                      </div>

                      <h4 className="mt-2 text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                        {incident.title}
                      </h4>

                      {/* Trigger & Service preview */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                        {incident.trigger?.serviceName && (
                          <span className="inline-flex items-center gap-1 text-zinc-300">
                            <Server className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[11px]">{incident.trigger.serviceName}</span>
                          </span>
                        )}

                        {incident.trigger?.errorRate !== undefined && (
                          <span className="text-rose-400">
                            err: {(incident.trigger.errorRate * 100).toFixed(0)}%
                          </span>
                        )}

                        {incident.trigger?.avgLatency !== undefined && (
                          <span className="text-amber-400">
                            p95: {Math.round(incident.trigger.avgLatency)}ms
                          </span>
                        )}
                      </div>

                      {/* Footer: timestamp & affected services count */}
                      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/50 pt-2 text-[11px] text-zinc-500">
                        <span>Started: {formatTimestamp(incident.startedAt)}</span>
                        <span>
                          {incident.affectedServices?.length || 0} affected svc
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Incident Detail & Replay Timeline */}
          <div className="lg:col-span-7 space-y-4">
            {selectedIncident ? (
              <>
                {/* Incident Detail Card */}
                <Card className="border-zinc-800 bg-zinc-900/90">
                  <CardHeader className="p-5 pb-4 border-b border-zinc-800">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider border',
                              getSeverityBadge(selectedIncident.severity)
                            )}
                          >
                            {selectedIncident.severity}
                          </span>
                          <StatusBadge status={selectedIncident.status} />
                          <span className="text-xs font-mono text-zinc-500">
                            ID: {selectedIncident.incidentId}
                          </span>
                        </div>
                        <h2 className="mt-2 text-lg font-bold text-zinc-100">
                          {selectedIncident.title}
                        </h2>
                      </div>

                      <div className="text-right sm:self-center">
                        <span className="text-xs text-zinc-500 block">Duration</span>
                        <span className="text-sm font-semibold text-zinc-200 font-mono">
                          {formatDuration(
                            selectedIncident.durationMs,
                            selectedIncident.startedAt,
                            selectedIncident.endedAt
                          )}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 space-y-4">
                    {/* Trigger and Root Cause Box */}
                    {selectedIncident.trigger && (
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-400">
                          <AlertTriangle className="h-4 w-4 text-rose-400" />
                          Root Cause Anomaly Trigger
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                          <div>
                            <span className="text-zinc-500 block text-[11px]">Primary Service</span>
                            <span className="font-semibold text-zinc-200 font-mono">
                              {selectedIncident.trigger.serviceName || 'unknown'}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[11px]">Trigger Rule</span>
                            <span className="font-semibold text-zinc-200">
                              {Array.isArray(selectedIncident.trigger.triggers)
                                ? selectedIncident.trigger.triggers.join(', ')
                                : 'threshold_exceeded'}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[11px]">Error Rate</span>
                            <span className="font-semibold text-rose-400 font-mono">
                              {selectedIncident.trigger.errorRate !== undefined
                                ? `${(selectedIncident.trigger.errorRate * 100).toFixed(1)}%`
                                : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[11px]">Average Latency</span>
                            <span className="font-semibold text-amber-400 font-mono">
                              {selectedIncident.trigger.avgLatency !== undefined
                                ? `${Math.round(selectedIncident.trigger.avgLatency)}ms`
                                : '—'}
                            </span>
                          </div>
                        </div>

                        {(selectedIncident.trigger.eventCount !== undefined ||
                          selectedIncident.trigger.errorCount !== undefined) && (
                          <div className="mt-3 pt-2.5 border-t border-rose-500/15 flex items-center justify-between text-[11px] text-zinc-400">
                            <span>
                              Evaluated Telemetry Window: {selectedIncident.trigger.eventCount} total events
                            </span>
                            <span className="text-rose-400 font-medium">
                              {selectedIncident.trigger.errorCount} server 5xx errors recorded
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Affected Services Tags */}
                    <div>
                      <span className="text-xs font-medium text-zinc-400 block mb-2">
                        Affected Services & Blast Radius (
                        {selectedIncident.affectedServices?.length || 0})
                      </span>
                      {selectedIncident.affectedServices &&
                      selectedIncident.affectedServices.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedIncident.affectedServices.map((svcId) => (
                            <span
                              key={svcId}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs font-mono text-zinc-300"
                            >
                              <Server className="h-3 w-3 text-zinc-500" />
                              {svcId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">
                          No upstream/downstream services directly correlated yet.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline Replay Card */}
                <Card className="border-zinc-800 bg-zinc-900/90">
                  <CardHeader className="p-5 pb-3 border-b border-zinc-800">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base text-zinc-100 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-rose-500" />
                            Chronological Timeline Replay
                          </CardTitle>
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-400">
                            {replayData?.timeline?.length || 0} events
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          Step-by-step reconstruction of failure cascade propagation from telemetry events.
                        </p>
                      </div>

                      {/* Replay Controls Toolbar */}
                      <div className="flex items-center gap-1.5 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setActiveStepIndex(0);
                          }}
                          disabled={!replayData?.timeline?.length}
                          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
                          title="Reset to initial event"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setActiveStepIndex((prev) => Math.max(0, prev - 1));
                          }}
                          disabled={!replayData?.timeline?.length || activeStepIndex === 0}
                          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
                          title="Step backward"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!replayData?.timeline?.length) return;
                            if (activeStepIndex >= replayData.timeline.length - 1) {
                              setActiveStepIndex(0);
                            }
                            setIsPlaying(!isPlaying);
                          }}
                          disabled={!replayData?.timeline?.length}
                          className={cn(
                            'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors',
                            isPlaying
                              ? 'bg-amber-600 text-white hover:bg-amber-500'
                              : 'bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-30'
                          )}
                          title={isPlaying ? 'Pause replay' : 'Play chronological timeline'}
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="h-3 w-3" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" /> Play
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            const max = (replayData?.timeline?.length || 1) - 1;
                            setActiveStepIndex((prev) => Math.min(max, prev + 1));
                          }}
                          disabled={
                            !replayData?.timeline?.length ||
                            activeStepIndex >= (replayData?.timeline?.length || 1) - 1
                          }
                          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
                          title="Step forward"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>

                        <div className="h-4 w-px bg-zinc-800 mx-1" />

                        {/* Speed Toggle */}
                        {[1, 2, 4].map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => setPlaySpeed(spd)}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors',
                              playSpeed === spd
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            )}
                          >
                            {spd}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scrubber slider */}
                    {replayData?.timeline && replayData.timeline.length > 1 && (
                      <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span className="text-[11px] text-zinc-500">
                            Step {activeStepIndex + 1} of {replayData.timeline.length}
                          </span>
                          <span className="font-mono text-emerald-400 text-[11px]">
                            {formatRelativeTime(replayData.timeline[activeStepIndex]?.relativeTimeMs)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={replayData.timeline.length - 1}
                          value={activeStepIndex}
                          onChange={(e) => {
                            setIsPlaying(false);
                            setActiveStepIndex(parseInt(e.target.value, 10));
                          }}
                          className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                        />
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="p-5">
                    {/* Event Type Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-5 pb-3 border-b border-zinc-800/60 text-xs">
                      <span className="text-zinc-500 mr-1 text-[11px]">Filter Type:</span>
                      {['ALL', 'ERROR', 'LATENCY_SPIKE', 'DEPLOYMENT', 'DEPENDENCY_FAILURE'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTimelineFilter(t)}
                          className={cn(
                            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                            timelineFilter === t
                              ? 'bg-zinc-800 text-white border border-zinc-700'
                              : 'text-zinc-400 hover:text-zinc-200'
                          )}
                        >
                          {t.replace('_', ' ')}
                        </button>
                      ))}
                    </div>

                    {replayLoading ? (
                      <LoadingState message="Fetching chronological replay events…" />
                    ) : replayError ? (
                      <ErrorState
                        title="Replay unavailable"
                        message={replayError.message || 'Could not fetch replay timeline for this incident.'}
                      />
                    ) : timelineEvents.length === 0 ? (
                      <EmptyState
                        icon={Clock}
                        title="No timeline events recorded"
                        message="There are no replay events matching the selected type filter for this incident."
                      />
                    ) : (
                      <div
                        ref={timelineContainerRef}
                        className="relative space-y-4 pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800"
                      >
                        {timelineEvents.map((event, idx) => {
                          const config = getEventTypeConfig(event.type);
                          const Icon = config.icon;
                          const isActive = idx === activeStepIndex;
                          const isPast = idx < activeStepIndex;

                          return (
                            <div
                              key={`${event.timestamp}-${idx}`}
                              onClick={() => {
                                setIsPlaying(false);
                                setActiveStepIndex(idx);
                              }}
                              className={cn(
                                'relative group cursor-pointer rounded-lg border p-3.5 transition-all duration-150',
                                isActive
                                  ? 'border-rose-500/60 bg-zinc-900 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/30'
                                  : isPast
                                  ? 'border-zinc-800 bg-zinc-900/40 opacity-75 hover:opacity-100 hover:border-zinc-700'
                                  : 'border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700'
                              )}
                            >
                              {/* Timeline track node */}
                              <div
                                className={cn(
                                  'absolute -left-[27px] top-4 h-3.5 w-3.5 rounded-full border-2 border-zinc-950 transition-all',
                                  isActive
                                    ? `${config.dotBg} ring-4 ${config.dotRing} scale-125`
                                    : isPast
                                    ? 'bg-zinc-600 ring-2 ring-zinc-800'
                                    : 'bg-zinc-700 ring-1 ring-zinc-800'
                                )}
                              />

                              {/* Event Header: Relative Time, Type Badge, Service */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      'font-mono text-xs font-bold px-1.5 py-0.5 rounded',
                                      isActive ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-400 bg-zinc-800/80'
                                    )}
                                  >
                                    {formatRelativeTime(event.relativeTimeMs)}
                                  </span>

                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border',
                                      config.bg,
                                      config.color,
                                      config.border
                                    )}
                                  >
                                    <Icon className="h-3 w-3" />
                                    {config.label}
                                  </span>

                                  <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-800">
                                    <Server className="h-3 w-3 text-zinc-500" />
                                    {event.serviceId}
                                  </span>
                                </div>

                                <span className="text-[11px] text-zinc-500 font-mono">
                                  {formatTimestamp(event.timestamp)}
                                </span>
                              </div>

                              {/* Event Message */}
                              <p className="mt-2 text-sm text-zinc-200 leading-relaxed font-normal">
                                {event.message}
                              </p>

                              {/* Metadata if present */}
                              {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <div className="mt-2.5 rounded border border-zinc-800 bg-zinc-950/70 p-2 text-[11px] font-mono text-zinc-400 space-y-1">
                                  {Object.entries(event.metadata).map(([key, val]) => (
                                    <div key={key} className="flex items-center justify-between">
                                      <span className="text-zinc-500">{key}:</span>
                                      <span className="text-zinc-300">
                                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-zinc-800 bg-zinc-900/60 p-12 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-zinc-600 mb-3" />
                <h3 className="text-sm font-semibold text-zinc-300">Select an Incident</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                  Choose an incident from the left list to inspect its anomaly trigger metrics and replay its chronological timeline.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
