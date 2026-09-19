import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Activity,
  Network,
  Rocket,
  Server,
  Database,
  ExternalLink,
  ShieldAlert,
  Layers,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Radio,
  FileCode,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { demoApi } from '../services/demo';
import { api } from '../services/api';
import { cn } from '../lib/utils';

// Static topology definition matching backend DemoSimulator.js
const TOPOLOGY_NODES = [
  { id: 'frontend', label: 'Frontend App', tier: 'ingress', type: 'service' },
  { id: 'api-gateway', label: 'API Gateway', tier: 'gateway', type: 'service' },
  { id: 'auth-service', label: 'Auth Service', tier: 'core', type: 'service' },
  { id: 'checkout-service', label: 'Checkout Service', tier: 'core', type: 'service' },
  { id: 'analytics-service', label: 'Analytics Service', tier: 'core', type: 'service' },
  { id: 'payment-service', label: 'Payment Service', tier: 'domain', type: 'service' },
  { id: 'orders-service', label: 'Orders Service', tier: 'domain', type: 'service' },
  { id: 'external-payment-provider', label: 'Payment Gateway', tier: 'sink', type: 'external' },
  { id: 'mongodb', label: 'MongoDB Cluster', tier: 'sink', type: 'database' },
  { id: 'notification-service', label: 'Notification Service', tier: 'sink', type: 'service' },
];

const SCENARIO_PROFILES = {
  'normal-traffic': {
    badge: 'Healthy Baseline',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: Activity,
    iconColor: 'text-emerald-400',
    severity: 'low',
    affectedServices: [
      'frontend',
      'api-gateway',
      'auth-service',
      'checkout-service',
      'payment-service',
      'external-payment-provider',
      'orders-service',
      'mongodb',
      'notification-service',
      'analytics-service',
    ],
    highlightServices: ['frontend', 'api-gateway', 'checkout-service'],
    expectedOutcome:
      'Ingests 9 healthy telemetry calls across all 10 services (HTTP 200, 45ms latency). Builds full baseline dependency topology with zero detected incidents.',
    approxEvents: 9,
    accentClass: 'hover:border-emerald-500/50',
    runBtnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  },
  'payment-deployment': {
    badge: 'Deployment Event',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: Rocket,
    iconColor: 'text-blue-400',
    severity: 'info',
    affectedServices: ['payment-service', 'external-payment-provider', 'checkout-service'],
    highlightServices: ['payment-service', 'checkout-service'],
    expectedOutcome:
      'Simulates release of payment-service v1.2.0 → v1.3.0. Ingests pre/post deployment telemetry, records deployment event, and computes pre-flight impact on callers.',
    approxEvents: 19,
    accentClass: 'hover:border-blue-500/50',
    runBtnClass: 'bg-blue-600 hover:bg-blue-500 text-white',
  },
  'payment-latency': {
    badge: 'Latency Degradation',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: Clock,
    iconColor: 'text-amber-400',
    severity: 'medium',
    affectedServices: ['payment-service', 'checkout-service', 'api-gateway'],
    highlightServices: ['payment-service', 'checkout-service'],
    expectedOutcome:
      'Injects high response latency (5,800ms–6,800ms) on payment-service. Simulates upstream backpressure and latency cascade to checkout-service.',
    approxEvents: 19,
    accentClass: 'hover:border-amber-500/50',
    runBtnClass: 'bg-amber-600 hover:bg-amber-500 text-white',
  },
  'payment-failure': {
    badge: 'Service Outage',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    icon: AlertTriangle,
    iconColor: 'text-rose-400',
    severity: 'high',
    affectedServices: ['checkout-service', 'payment-service'],
    highlightServices: ['checkout-service', 'payment-service'],
    expectedOutcome:
      'Injects HTTP 500 server errors (75% failure rate). Triggers automated incident detection algorithm and evaluates upstream blast radius.',
    approxEvents: 16,
    accentClass: 'hover:border-rose-500/50',
    runBtnClass: 'bg-rose-600 hover:bg-rose-500 text-white',
  },
  'complete-incident': {
    badge: 'Full Incident Cascade',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    icon: Zap,
    iconColor: 'text-purple-400',
    severity: 'critical',
    affectedServices: [
      'payment-service',
      'checkout-service',
      'api-gateway',
      'orders-service',
      'external-payment-provider',
    ],
    highlightServices: ['payment-service', 'checkout-service', 'api-gateway'],
    expectedOutcome:
      'Executes complete 4-phase cascade: healthy baseline → deployment → latency escalation → 500 failures → automated incident detection → blast radius.',
    approxEvents: 24,
    accentClass: 'hover:border-purple-500/50',
    runBtnClass: 'bg-purple-600 hover:bg-purple-500 text-white',
  },
};

export function Demo() {
  const navigate = useNavigate();

  // State
  const [scenarios, setScenarios] = useState([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [scenariosError, setScenariosError] = useState(null);

  const [selectedScenarioId, setSelectedScenarioId] = useState('complete-incident');
  const [executing, setExecuting] = useState(false);
  const [executingScenarioId, setExecutingScenarioId] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionDuration, setExecutionDuration] = useState(null);
  const [executionError, setExecutionError] = useState(null);

  // Reset confirmation modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccessNotice, setResetSuccessNotice] = useState(null);
  const [resetError, setResetError] = useState(null);

  // Raw JSON viewer toggle
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Service name resolver map
  const [servicesMap, setServicesMap] = useState({});

  // Load scenarios from backend
  const loadScenarios = useCallback(() => {
    setLoadingScenarios(true);
    setScenariosError(null);
    demoApi
      .getScenarios()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setScenarios(list);
        if (list.length > 0 && !list.some((s) => s.id === selectedScenarioId)) {
          setSelectedScenarioId(list[0].id);
        }
      })
      .catch((err) => {
        setScenariosError(err);
      })
      .finally(() => {
        setLoadingScenarios(false);
      });
  }, [selectedScenarioId]);

  // Load services list to map UUIDs to human-friendly service names
  const refreshServicesMap = useCallback(() => {
    api
      .get('/services')
      .then((data) => {
        if (Array.isArray(data)) {
          const map = {};
          data.forEach((s) => {
            if (s.serviceId) map[s.serviceId] = s.name;
          });
          setServicesMap(map);
        }
      })
      .catch(() => {
        // Non-critical helper, ignore errors
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    demoApi
      .getScenarios()
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : [];
        setScenarios(list);
        if (list.length > 0) {
          setSelectedScenarioId((prev) => (list.some((s) => s.id === prev) ? prev : list[0].id));
        }
      })
      .catch((err) => {
        if (isMounted) setScenariosError(err);
      })
      .finally(() => {
        if (isMounted) setLoadingScenarios(false);
      });

    api
      .get('/services')
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        const map = {};
        data.forEach((s) => {
          if (s.serviceId) map[s.serviceId] = s.name;
        });
        setServicesMap(map);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Helper to resolve service UUID to human name
  const resolveServiceName = useCallback(
    (idOrName) => {
      if (!idOrName) return '—';
      return servicesMap[idOrName] || idOrName;
    },
    [servicesMap]
  );

  // Execute scenario handler
  const handleRunScenario = useCallback(
    async (scenarioId) => {
      if (executing || resetting) return;

      const id = scenarioId || selectedScenarioId;
      setSelectedScenarioId(id);
      setExecuting(true);
      setExecutingScenarioId(id);
      setExecutionError(null);
      setResetSuccessNotice(null);
      const startEpoch = Date.now();

      try {
        let result;
        if (id === 'complete-incident') {
          result = await demoApi.startCompleteIncident();
        } else {
          result = await demoApi.runScenario(id);
        }
        const duration = Date.now() - startEpoch;
        setExecutionDuration(Math.max(1, duration));
        setExecutionResult(result);
        refreshServicesMap();
      } catch (err) {
        setExecutionError(err);
        setExecutionResult(null);
      } finally {
        setExecuting(false);
        setExecutingScenarioId(null);
      }
    },
    [executing, resetting, selectedScenarioId, refreshServicesMap]
  );

  // Reset demo handler
  const handleConfirmReset = async () => {
    if (resetting || executing) return;

    setResetting(true);
    setResetError(null);

    try {
      await demoApi.resetDemo();
      setResetModalOpen(false);
      setExecutionResult(null);
      setExecutionError(null);
      setExecutionDuration(null);
      setServicesMap({});
      setResetSuccessNotice(
        'Demo environment reset successfully. All services, dependencies, telemetry, incidents, and deployments have been cleared.'
      );
      refreshServicesMap();
    } catch (err) {
      setResetError(err);
    } finally {
      setResetting(false);
    }
  };

  // Copy raw JSON to clipboard
  const handleCopyJson = () => {
    if (!executionResult) return;
    navigator.clipboard.writeText(JSON.stringify(executionResult, null, 2)).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    });
  };

  // Identify currently active profile
  const activeProfile = useMemo(() => {
    return SCENARIO_PROFILES[selectedScenarioId] || SCENARIO_PROFILES['complete-incident'];
  }, [selectedScenarioId]);

  // Highlighted nodes for topology schematic
  const highlightedNodeIds = useMemo(() => {
    if (executionResult?.scenario && SCENARIO_PROFILES[executionResult.scenario]) {
      return SCENARIO_PROFILES[executionResult.scenario].highlightServices;
    }
    return activeProfile.highlightServices;
  }, [executionResult, activeProfile]);

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Demo Simulator</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400 border border-purple-500/20">
              <Zap className="h-3 w-3" />
              Stage 16
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Run deterministic production scenarios and observe how telemetry, dependencies,
            incidents, and deployments propagate through GhostStack.
          </p>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadScenarios}
            disabled={loadingScenarios || executing || resetting}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh scenario definitions"
          >
            <RotateCcw className={cn('h-3.5 w-3.5', loadingScenarios && 'animate-spin')} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            disabled={executing || resetting}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-900/60 bg-rose-950/40 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-900/50 hover:text-rose-100 transition-colors disabled:opacity-50"
            title="Clear all demo data"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
            Reset Demo
          </button>
        </div>
      </div>

      {/* Reset Success Notice */}
      {resetSuccessNotice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-200">Environment Reset</p>
              <p className="text-xs text-emerald-300/90 mt-0.5">{resetSuccessNotice}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setResetSuccessNotice(null)}
            className="text-emerald-400 hover:text-emerald-200 transition-colors"
            aria-label="Dismiss reset notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Execution Error Banner */}
      {executionError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-rose-200">Simulation Error</p>
              <p className="text-xs text-rose-300/90 mt-0.5">
                {executionError.message || 'Failed to execute demo scenario.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExecutionError(null)}
            className="text-rose-400 hover:text-rose-200 transition-colors"
            aria-label="Dismiss error notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Simulator Topology Flow Schematic */}
      <Card>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4 text-emerald-400" />
                Target Demo Topology Flow
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-1">
                Deterministic microservice call graph with active scenario focus highlight.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Normal
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Scenario Target
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Column 1: Ingress */}
            <div className="flex flex-col space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
                1. Ingress
              </span>
              <TopologyNodeCard
                node={TOPOLOGY_NODES[0]}
                isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[0].id)}
              />
            </div>

            {/* Column 2: Gateway */}
            <div className="flex flex-col space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
                2. Gateway
              </span>
              <TopologyNodeCard
                node={TOPOLOGY_NODES[1]}
                isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[1].id)}
              />
            </div>

            {/* Column 3: Core Services */}
            <div className="flex flex-col space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
                3. Core Tier
              </span>
              <div className="space-y-2">
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[2]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[2].id)}
                />
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[3]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[3].id)}
                />
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[4]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[4].id)}
                />
              </div>
            </div>

            {/* Column 4: Domain Tier */}
            <div className="flex flex-col space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
                4. Domain Tier
              </span>
              <div className="space-y-2">
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[5]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[5].id)}
                />
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[6]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[6].id)}
                />
              </div>
            </div>

            {/* Column 5: Sinks & External */}
            <div className="flex flex-col space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
                5. Sinks / External
              </span>
              <div className="space-y-2">
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[7]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[7].id)}
                />
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[8]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[8].id)}
                />
                <TopologyNodeCard
                  node={TOPOLOGY_NODES[9]}
                  isHighlighted={highlightedNodeIds.includes(TOPOLOGY_NODES[9].id)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scenario Selector Cards Section */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="text-base font-semibold text-zinc-200">Deterministic Demo Scenarios</h2>
            <p className="text-xs text-zinc-400">
              Select a scenario to simulate production telemetry events and observe system propagation.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded">
            {scenarios.length} Scenarios Available
          </span>
        </div>

        {loadingScenarios ? (
          <Card>
            <CardContent className="py-12">
              <LoadingState message="Loading demo scenarios from backend..." />
            </CardContent>
          </Card>
        ) : scenariosError ? (
          <Card>
            <CardContent className="py-8">
              <ErrorState
                title="Failed to Load Scenarios"
                message={scenariosError.message}
                onRetry={loadScenarios}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scenarios.map((sc) => {
              const profile = SCENARIO_PROFILES[sc.id] || SCENARIO_PROFILES['complete-incident'];
              const isSelected = selectedScenarioId === sc.id;
              const isThisRunning = executing && executingScenarioId === sc.id;
              const IconComponent = profile.icon;

              return (
                <div
                  key={sc.id}
                  onClick={() => !executing && setSelectedScenarioId(sc.id)}
                  className={cn(
                    'group relative flex flex-col justify-between rounded-lg border p-5 transition-all cursor-pointer',
                    'bg-zinc-900/90 text-zinc-100',
                    isSelected
                      ? 'border-purple-500/60 ring-1 ring-purple-500/40 bg-zinc-900 shadow-md shadow-purple-950/20'
                      : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/95',
                    executing && !isThisRunning && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {/* Top Row: Icon, Title & Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            'p-2 rounded-md bg-zinc-800/80 border border-zinc-700/50',
                            isSelected && 'bg-purple-950/50 border-purple-800/60'
                          )}
                        >
                          <IconComponent className={cn('h-4 w-4', profile.iconColor)} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-100 leading-snug">
                            {sc.name}
                          </h3>
                          <span className="text-[11px] font-mono text-zinc-400">
                            id: {sc.id}
                          </span>
                        </div>
                      </div>

                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                          profile.badgeClass
                        )}
                      >
                        {profile.badge}
                      </span>
                    </div>

                    {/* Description from backend */}
                    <p className="text-xs text-zinc-300/90 leading-relaxed mb-4">
                      {sc.description}
                    </p>

                    {/* Expected Outcome */}
                    <div className="rounded border border-zinc-800/80 bg-zinc-950/50 p-2.5 mb-4">
                      <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                        Expected Outcome
                      </span>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {profile.expectedOutcome}
                      </p>
                    </div>

                    {/* Affected Services Tags */}
                    <div className="mb-4">
                      <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1.5">
                        Affected Services ({profile.affectedServices.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {profile.affectedServices.slice(0, 4).map((srv) => (
                          <span
                            key={srv}
                            className="rounded bg-zinc-800/80 border border-zinc-700/60 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300"
                          >
                            {srv}
                          </span>
                        ))}
                        {profile.affectedServices.length > 4 && (
                          <span className="rounded bg-zinc-800/40 border border-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                            +{profile.affectedServices.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Run Button */}
                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-400 font-mono">
                      ~{profile.approxEvents} events
                    </span>

                    <button
                      type="button"
                      disabled={executing || resetting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunScenario(sc.id);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition-all',
                        isThisRunning
                          ? 'bg-purple-600 text-white cursor-wait'
                          : profile.runBtnClass,
                        (executing || resetting) && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      {isThisRunning ? (
                        <>
                          <RotateCcw className="h-3 w-3 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 fill-current" />
                          Run Scenario
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Execution Running State Card */}
      {executing && (
        <Card className="border-purple-500/40 bg-purple-950/15">
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 border border-purple-500/30">
                  <RotateCcw className="h-5 w-5 text-purple-400 animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    Executing Scenario: {executingScenarioId}
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Processing deterministic telemetry events, evaluating topology graphs, and
                    running incident analysis...
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-purple-300/80 bg-purple-900/30 border border-purple-800/40 px-3 py-1.5 rounded">
                <Radio className="h-3.5 w-3.5 animate-pulse text-purple-400" />
                Simulation in progress
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulation Results Panel */}
      {executionResult && !executing && (
        <div className="space-y-4">
          <Card className="border-emerald-500/30 bg-zinc-900">
            <CardHeader className="pb-3 border-b border-zinc-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Simulation Completed:
                      <span className="text-emerald-400 font-mono">
                        {executionResult.scenario}
                      </span>
                    </CardTitle>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Deterministic backend pipeline executed successfully in{' '}
                      <span className="text-zinc-200 font-mono font-medium">
                        {executionDuration}ms
                      </span>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRawJson((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <FileCode className="h-3.5 w-3.5 text-zinc-400" />
                    {showRawJson ? 'Hide Raw JSON' : 'View Raw JSON'}
                    {showRawJson ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
              {/* Four Core Metric Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Metric 1: Events Processed */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Events Processed
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-zinc-100 font-mono">
                      {executionResult.eventsProcessed ?? 0}
                    </span>
                    <span className="text-xs text-emerald-400 font-mono">telemetry</span>
                  </div>
                </div>

                {/* Metric 2: Deployments Created */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Deployments Recorded
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-zinc-100 font-mono">
                      {executionResult.deployment ? 1 : 0}
                    </span>
                    {executionResult.deployment ? (
                      <span className="text-xs text-blue-400 font-mono">
                        {executionResult.deployment.newVersion || 'created'}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 font-mono">none</span>
                    )}
                  </div>
                </div>

                {/* Metric 3: Incidents Detected */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Incidents Detected
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={cn(
                        'text-xl font-bold font-mono',
                        (executionResult.incidentsDetected ||
                          executionResult.incidents?.length ||
                          0) > 0
                          ? 'text-rose-400'
                          : 'text-zinc-100'
                      )}
                    >
                      {executionResult.incidentsDetected ??
                        executionResult.incidents?.length ??
                        0}
                    </span>
                    {(executionResult.incidentsDetected ||
                      executionResult.incidents?.length ||
                      0) > 0 ? (
                      <span className="text-xs text-rose-400 font-mono">anomaly active</span>
                    ) : (
                      <span className="text-xs text-emerald-400 font-mono">all nominal</span>
                    )}
                  </div>
                </div>

                {/* Metric 4: Blast Radius / Discovered Services */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Blast Radius / Services
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-zinc-100 font-mono">
                      {executionResult.blastRadius?.totalAffectedCount ??
                        executionResult.impactAnalysis?.totalPotentiallyAffected ??
                        executionResult.servicesDiscovered?.length ??
                        0}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {executionResult.blastRadius
                        ? 'impacted nodes'
                        : executionResult.impactAnalysis
                        ? 'affected'
                        : 'services'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub-section: Deployment Details if present */}
              {executionResult.deployment && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-950/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-blue-400" />
                      <h4 className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                        Deployment Event Recorded
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {executionResult.deployment.environment || 'production'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mt-3">
                    <div>
                      <span className="text-zinc-400 block">Target Service:</span>
                      <span className="font-mono text-zinc-200">
                        {resolveServiceName(executionResult.deployment.serviceId)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block">Version Bump:</span>
                      <span className="font-mono text-zinc-200">
                        {executionResult.deployment.previousVersion || 'unknown'} →{' '}
                        <strong className="text-blue-300">
                          {executionResult.deployment.newVersion}
                        </strong>
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block">Deployment ID:</span>
                      <span className="font-mono text-zinc-400 truncate block">
                        {executionResult.deployment.deploymentId}
                      </span>
                    </div>
                  </div>

                  {executionResult.impactAnalysis && (
                    <div className="mt-3 pt-3 border-t border-blue-900/40 flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-zinc-400">Pre-Flight Impact Assessment:</span>
                      <span className="text-zinc-300">
                        Direct Dependents:{' '}
                        <strong className="text-zinc-100 font-mono">
                          {executionResult.impactAnalysis.directDependents?.length || 0}
                        </strong>
                      </span>
                      <span className="text-zinc-300">
                        Indirect Dependents:{' '}
                        <strong className="text-zinc-100 font-mono">
                          {executionResult.impactAnalysis.indirectDependents?.length || 0}
                        </strong>
                      </span>
                      <span className="text-zinc-300">
                        Total Potentially Affected:{' '}
                        <strong className="text-amber-400 font-mono">
                          {executionResult.impactAnalysis.totalPotentiallyAffected || 0}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-section: Incidents & Blast Radius if present */}
              {Array.isArray(executionResult.incidents) && executionResult.incidents.length > 0 && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-400" />
                      <h4 className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
                        Incident Detected & Triaged
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      Active Anomaly
                    </span>
                  </div>

                  {executionResult.incidents.map((inc) => (
                    <div
                      key={inc.incidentId || inc.title}
                      className="rounded border border-rose-900/40 bg-zinc-950/60 p-3 space-y-2 mb-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-xs font-medium text-rose-200">{inc.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-300">
                            Severity: {inc.severity}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            Status: {inc.status}
                          </span>
                        </div>
                      </div>

                      {inc.trigger && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800/80 text-[11px]">
                          <div>
                            <span className="text-zinc-400 block">Root Service:</span>
                            <span className="font-mono text-zinc-200">
                              {inc.trigger.serviceName}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block">Trigger:</span>
                            <span className="font-mono text-amber-300">
                              {inc.trigger.triggers?.join(', ') || 'error_rate'}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block">Error Rate:</span>
                            <span className="font-mono text-rose-300">
                              {Math.round((inc.trigger.errorRate || 0) * 100)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block">Avg Latency:</span>
                            <span className="font-mono text-zinc-200">
                              {Math.round(inc.trigger.avgLatency || 0)}ms
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Blast Radius Details */}
                  {executionResult.blastRadius && (
                    <div className="mt-3 pt-3 border-t border-rose-900/30 flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-zinc-400">Blast Radius Calculation:</span>
                      <span className="text-zinc-300">
                        Root Target:{' '}
                        <strong className="text-zinc-100 font-mono">
                          {resolveServiceName(executionResult.blastRadius.serviceId)}
                        </strong>
                      </span>
                      <span className="text-zinc-300">
                        Directly Affected:{' '}
                        <strong className="text-rose-400 font-mono">
                          {executionResult.blastRadius.directlyAffected?.length || 0}
                        </strong>
                      </span>
                      <span className="text-zinc-300">
                        Indirectly Affected:{' '}
                        <strong className="text-amber-400 font-mono">
                          {executionResult.blastRadius.indirectlyAffected?.length || 0}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-section: Discovered Services for normal traffic */}
              {Array.isArray(executionResult.servicesDiscovered) && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      Services Discovered In Topology (
                      {executionResult.servicesDiscovered.length})
                    </span>
                    {executionResult.topology && (
                      <span className="text-xs font-mono text-zinc-400">
                        {executionResult.topology.nodeCount} nodes,{' '}
                        {executionResult.topology.edgeCount} edges
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {executionResult.servicesDiscovered.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-200 border border-zinc-700/50"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON Accordion */}
              {showRawJson && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-zinc-400">
                      backend payload response
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {copiedJson ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <FileCode className="h-3 w-3" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-emerald-400/90 overflow-x-auto p-3 bg-zinc-900 rounded max-h-72">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cross-Navigation Action Grid */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-emerald-400" />
                  Inspect Propagated State Across GhostStack
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Verify how this simulation altered live health, dependencies, incidents, and
                  deployment records.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Action 1: Dashboard */}
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="group flex flex-col justify-between text-left p-3.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-emerald-500/50 hover:bg-zinc-900 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Dashboard
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                    Inspect live system health, total active services, and incident counts.
                  </p>
                </div>
                <span className="mt-3 text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                  View Overview &rarr;
                </span>
              </button>

              {/* Action 2: Dependency Graph */}
              <button
                type="button"
                onClick={() => navigate('/dependency-graph')}
                className="group flex flex-col justify-between text-left p-3.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-blue-500/50 hover:bg-zinc-900 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Network className="h-4 w-4 text-blue-400" />
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Dependency Graph
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                    Explore interactive service topology, connection matrix, and blast radius.
                  </p>
                </div>
                <span className="mt-3 text-[11px] font-medium text-blue-400 flex items-center gap-1">
                  Inspect Topology &rarr;
                </span>
              </button>

              {/* Action 3: Incidents */}
              <button
                type="button"
                onClick={() => navigate('/incidents')}
                className="group flex flex-col justify-between text-left p-3.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-rose-500/50 hover:bg-zinc-900 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Incidents
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                    Review detected anomalies and replay chronological event timelines.
                  </p>
                </div>
                <span className="mt-3 text-[11px] font-medium text-rose-400 flex items-center gap-1">
                  View Intelligence &rarr;
                </span>
              </button>

              {/* Action 4: Deployments */}
              <button
                type="button"
                onClick={() => navigate('/deployments')}
                className="group flex flex-col justify-between text-left p-3.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-purple-500/50 hover:bg-zinc-900 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Rocket className="h-4 w-4 text-purple-400" />
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Deployments
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                    Simulate release impact, assess upstream risk, and record events.
                  </p>
                </div>
                <span className="mt-3 text-[11px] font-medium text-purple-400 flex items-center gap-1">
                  Analyze Impact &rarr;
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive Reset Confirmation Modal */}
      {resetModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => !resetting && setResetModalOpen(false)}
          />

          {/* Dialog Body */}
          <div className="relative w-full max-w-md rounded-xl border border-rose-900/60 bg-zinc-950 p-6 shadow-2xl z-10 text-zinc-100">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 flex-shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 id="reset-modal-title" className="text-base font-bold text-zinc-100">
                  Reset Demo Data?
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  This is a destructive action that will permanently clear demo/test records from
                  the local database.
                </p>
              </div>
            </div>

            <div className="my-4 rounded-lg border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-300">
              <p className="font-semibold text-rose-200 mb-1.5">
                The following collections will be cleared:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-rose-300/90 font-mono text-[11px]">
                <li>Services Catalog &amp; Metadata</li>
                <li>Dependency Graph Connections</li>
                <li>Ingested Telemetry Timeseries Events</li>
                <li>Active &amp; Historical Incidents</li>
                <li>Recorded Deployment Events</li>
              </ul>
            </div>

            {resetError && (
              <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                {resetError.message || 'Failed to reset demo data.'}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetModalOpen(false)}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={resetting}
                onClick={handleConfirmReset}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors shadow-sm disabled:opacity-50"
              >
                {resetting ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                    Clearing Data...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Reset Demo Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lightweight helper component for displaying topology nodes in flow schematic
 */
function TopologyNodeCard({ node, isHighlighted }) {
  const Icon =
    node.type === 'database'
      ? Database
      : node.type === 'external'
      ? ExternalLink
      : node.tier === 'ingress'
      ? Layers
      : Server;

  return (
    <div
      className={cn(
        'rounded-md border p-2 text-left transition-all',
        isHighlighted
          ? 'border-rose-500/60 bg-rose-950/20 text-rose-200 ring-1 ring-rose-500/40'
          : 'border-zinc-800/80 bg-zinc-950/70 text-zinc-300'
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0',
            isHighlighted ? 'text-rose-400' : 'text-zinc-400'
          )}
        />
        <span className="text-[11px] font-medium font-mono truncate">{node.id}</span>
      </div>
      <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-1">
        <span>{node.label}</span>
        {isHighlighted && (
          <span className="text-rose-400 font-semibold font-mono text-[9px]">ACTIVE</span>
        )}
      </div>
    </div>
  );
}
