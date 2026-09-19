import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ArrowRight,
  ShieldAlert,
  Layers,
  Box,
  Database,
  ExternalLink,
  RefreshCw,
  List,
  Activity,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { dependencyApi } from '../services/dependencies';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------------ */
/*  Constants & Color Mappings                                        */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG = {
  sync: {
    color: '#60a5fa', // blue-400
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    label: 'Sync HTTP',
  },
  async: {
    color: '#fbbf24', // amber-400
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    label: 'Async Event',
  },
  database: {
    color: '#34d399', // emerald-400
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    label: 'Database',
  },
  external: {
    color: '#a78bfa', // violet-400
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    label: 'External API',
  },
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 64;

function getNodeIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('mongo') || n.includes('db') || n.includes('redis') || n.includes('database')) {
    return Database;
  }
  if (n.includes('external') || n.includes('stripe') || n.includes('provider') || n.includes('thirdparty')) {
    return ExternalLink;
  }
  if (n.includes('gateway') || n.includes('ingress')) {
    return Activity;
  }
  return Box;
}

function formatTimestamp(iso) {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Topological Layout Calculation                                    */
/* ------------------------------------------------------------------ */

function calculateTopologicalLayout(services, edges) {
  const nodeIds = Array.from(
    new Set([
      ...services.map((s) => s.serviceId),
      ...edges.map((e) => e.sourceServiceId),
      ...edges.map((e) => e.targetServiceId),
    ])
  );

  if (nodeIds.length === 0) {
    return { positions: {}, width: 800, height: 500 };
  }

  // Build adjacency
  const inDegree = new Map();
  const outgoing = new Map();
  nodeIds.forEach((id) => {
    inDegree.set(id, 0);
    outgoing.set(id, []);
  });

  edges.forEach((edge) => {
    if (outgoing.has(edge.sourceServiceId)) {
      outgoing.get(edge.sourceServiceId).push(edge.targetServiceId);
    }
    if (inDegree.has(edge.targetServiceId)) {
      inDegree.set(edge.targetServiceId, inDegree.get(edge.targetServiceId) + 1);
    }
  });

  // Assign layers using BFS from root nodes (inDegree 0)
  const ranks = new Map();
  const queue = [];

  nodeIds.forEach((id) => {
    if (inDegree.get(id) === 0) {
      ranks.set(id, 0);
      queue.push(id);
    }
  });

  // If no root node (all have incoming edges / cycle), initialize with min in-degree
  if (queue.length === 0 && nodeIds.length > 0) {
    let minDeg = Infinity;
    let startNode = nodeIds[0];
    nodeIds.forEach((id) => {
      const deg = inDegree.get(id);
      if (deg < minDeg) {
        minDeg = deg;
        startNode = id;
      }
    });
    ranks.set(startNode, 0);
    queue.push(startNode);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const currentRank = ranks.get(current) || 0;
    const targets = outgoing.get(current) || [];

    targets.forEach((targetId) => {
      const prevRank = ranks.get(targetId);
      if (prevRank === undefined || prevRank < currentRank + 1) {
        ranks.set(targetId, currentRank + 1);
        queue.push(targetId);
      }
    });
  }

  // Handle any disconnected unvisited nodes
  nodeIds.forEach((id) => {
    if (!ranks.has(id)) {
      ranks.set(id, 0);
    }
  });

  // Group by rank
  const layers = new Map();
  nodeIds.forEach((id) => {
    const r = ranks.get(id) || 0;
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r).push(id);
  });

  const sortedRanks = Array.from(layers.keys()).sort((a, b) => a - b);
  const maxNodesInLayer = Math.max(
    ...Array.from(layers.values()).map((l) => l.length),
    1
  );

  const columnWidth = 260;
  const rowHeight = 110;

  const width = Math.max(920, (sortedRanks.length + 1) * columnWidth);
  const height = Math.max(540, (maxNodesInLayer + 1) * rowHeight);

  const positions = {};

  sortedRanks.forEach((rank, colIdx) => {
    const layerNodes = layers.get(rank) || [];
    const count = layerNodes.length;
    const x = 70 + colIdx * columnWidth;

    layerNodes.forEach((nodeId, rowIdx) => {
      const y = (height / (count + 1)) * (rowIdx + 1) - NODE_HEIGHT / 2;
      positions[nodeId] = { x, y };
    });
  });

  return { positions, width, height };
}

/* ------------------------------------------------------------------ */
/*  Main Dependency Graph Component                                   */
/* ------------------------------------------------------------------ */

export function DependencyGraph() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState({ stats: {}, edges: [] });
  const [services, setServices] = useState([]);

  // View & Filter States
  const [activeTab, setActiveTab] = useState('graph'); // 'graph' | 'matrix'
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [showBlastRadius, setShowBlastRadius] = useState(true);

  // Blast Radius State
  const [blastData, setBlastData] = useState(null);
  const [blastLoading, setBlastLoading] = useState(false);
  const [blastError, setBlastError] = useState(null);

  // Interactive Pan / Zoom & Dragging
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState({});
  const [draggedNode, setDraggedNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const svgRef = useRef(null);

  // Selection & Blast Radius trigger
  const handleSelectService = useCallback((id) => {
    setSelectedServiceId(id);
    setBlastData(null);
    setBlastError(null);
    if (!id) return;

    setBlastLoading(true);
    dependencyApi
      .getBlastRadius(id)
      .then((data) => {
        setBlastData(data);
      })
      .catch((err) => {
        setBlastError(err?.message || 'Failed to calculate blast radius');
      })
      .finally(() => {
        setBlastLoading(false);
      });
  }, []);

  // 1. Fetch initial graph and service data
  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([dependencyApi.getGraph(), dependencyApi.getServices()])
      .then(([graphRes, servicesRes]) => {
        setGraphData(graphRes || { stats: {}, edges: [] });
        setServices(servicesRes || []);
        const layout = calculateTopologicalLayout(
          servicesRes || [],
          graphRes?.edges || []
        );
        setNodePositions(layout.positions);
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
    Promise.all([dependencyApi.getGraph(), dependencyApi.getServices()])
      .then(([graphRes, servicesRes]) => {
        if (!isMounted) return;
        setGraphData(graphRes || { stats: {}, edges: [] });
        setServices(servicesRes || []);
        const layout = calculateTopologicalLayout(
          servicesRes || [],
          graphRes?.edges || []
        );
        setNodePositions(layout.positions);
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

  // Lookup map for fast service retrieval
  const servicesMap = useMemo(() => {
    const map = new Map();
    services.forEach((s) => map.set(s.serviceId, s));
    // Also include any synthetic nodes from edges
    (graphData.edges || []).forEach((e) => {
      if (!map.has(e.sourceServiceId)) {
        map.set(e.sourceServiceId, {
          serviceId: e.sourceServiceId,
          name: e.sourceServiceId,
          environment: 'unknown',
        });
      }
      if (!map.has(e.targetServiceId)) {
        map.set(e.targetServiceId, {
          serviceId: e.targetServiceId,
          name: e.targetServiceId,
          environment: 'unknown',
        });
      }
    });
    return map;
  }, [services, graphData.edges]);

  // Filtered edges
  const filteredEdges = useMemo(() => {
    let edges = graphData.edges || [];
    if (typeFilter !== 'all') {
      edges = edges.filter((e) => e.dependencyType === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      edges = edges.filter((e) => {
        const src = servicesMap.get(e.sourceServiceId)?.name?.toLowerCase() || '';
        const tgt = servicesMap.get(e.targetServiceId)?.name?.toLowerCase() || '';
        return src.includes(q) || tgt.includes(q);
      });
    }
    return edges;
  }, [graphData.edges, typeFilter, searchQuery, servicesMap]);

  // Sets for blast radius highlighting
  const blastSets = useMemo(() => {
    if (!blastData || !showBlastRadius) {
      return {
        direct: new Set(),
        indirect: new Set(),
        downstream: new Set(),
        allAffected: new Set(),
      };
    }
    return {
      direct: new Set(blastData.directlyAffected || []),
      indirect: new Set(blastData.indirectlyAffected || []),
      downstream: new Set(blastData.downstreamServices || []),
      allAffected: new Set([
        ...(blastData.directlyAffected || []),
        ...(blastData.indirectlyAffected || []),
      ]),
    };
  }, [blastData, showBlastRadius]);

  // Direct dependencies for selected node (upstream / downstream)
  const selectionRel = useMemo(() => {
    if (!selectedServiceId) return { callers: new Set(), dependencies: new Set() };
    const callers = new Set();
    const dependencies = new Set();
    (graphData.edges || []).forEach((e) => {
      if (e.targetServiceId === selectedServiceId) callers.add(e.sourceServiceId);
      if (e.sourceServiceId === selectedServiceId) dependencies.add(e.targetServiceId);
    });
    return { callers, dependencies };
  }, [selectedServiceId, graphData.edges]);

  // Canvas bounds
  const canvasBounds = useMemo(() => {
    let maxX = 900;
    let maxY = 550;
    Object.values(nodePositions).forEach((pos) => {
      if (pos.x + NODE_WIDTH + 80 > maxX) maxX = pos.x + NODE_WIDTH + 80;
      if (pos.y + NODE_HEIGHT + 80 > maxY) maxY = pos.y + NODE_HEIGHT + 80;
    });
    return { width: maxX, height: maxY };
  }, [nodePositions]);

  // Dragging Handlers
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    const pos = nodePositions[nodeId] || { x: 0, y: 0 };
    setDraggedNode(nodeId);
    setDragOffset({
      x: e.clientX / zoom - pos.x,
      y: e.clientY / zoom - pos.y,
    });
  };

  const handleCanvasMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (draggedNode) {
      const newX = Math.max(10, e.clientX / zoom - dragOffset.x);
      const newY = Math.max(10, e.clientY / zoom - dragOffset.y);
      setNodePositions((prev) => ({
        ...prev,
        [draggedNode]: { x: newX, y: newY },
      }));
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggedNode(null);
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const layout = calculateTopologicalLayout(services, graphData.edges || []);
    setNodePositions(layout.positions);
  };

  // Render loading / error
  if (loading) {
    return <LoadingState message="Loading dependency graph topology…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to Load Dependency Graph"
        message={error.message || 'Could not communicate with the backend dependency API.'}
      />
    );
  }

  const allNodeIds = Array.from(servicesMap.keys());
  const selectedService = selectedServiceId ? servicesMap.get(selectedServiceId) : null;

  return (
    <div className="space-y-6">
      {/* 1. Header Overview & Stat Badges */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900/90 border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Services</p>
                <p className="mt-1 text-2xl font-bold text-zinc-100">
                  {graphData.stats?.nodeCount ?? allNodeIds.length}
                </p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400 border border-blue-500/20">
                <Box className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/90 border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Dependencies</p>
                <p className="mt-1 text-2xl font-bold text-zinc-100">
                  {graphData.stats?.edgeCount ?? (graphData.edges || []).length}
                </p>
              </div>
              <div className="rounded-lg bg-violet-500/10 p-2.5 text-violet-400 border border-violet-500/20">
                <Network className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/90 border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Components</p>
                <p className="mt-1 text-2xl font-bold text-zinc-100">
                  {graphData.stats?.components ?? 1}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400 border border-emerald-500/20">
                <Layers className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/90 border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Active Selection</p>
                <p className="mt-1 text-sm font-semibold text-zinc-200 truncate max-w-[160px]">
                  {selectedService ? selectedService.name : 'None (Click Node)'}
                </p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-400 border border-amber-500/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Control Toolbar */}
      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Search & Filter */}
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-950/80 border border-zinc-800 rounded-md text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
            </div>

            {/* Dependency Type Pills */}
            <div className="flex items-center gap-1 bg-zinc-950/60 p-1 rounded-md border border-zinc-800">
              {['all', 'sync', 'async', 'database', 'external'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize',
                    typeFilter === t
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Right: View Toggle & Graph Controls */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-zinc-950/60 p-1 rounded-md border border-zinc-800 mr-2">
              <button
                type="button"
                onClick={() => setActiveTab('graph')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  activeTab === 'graph'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <Network className="h-3.5 w-3.5" />
                Graph View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  activeTab === 'matrix'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <List className="h-3.5 w-3.5" />
                Edge Matrix ({filteredEdges.length})
              </button>
            </div>

            {/* Graph Zoom/Reset (only shown in graph tab) */}
            {activeTab === 'graph' && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
                  className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50"
                  title="Zoom In"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                  className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50"
                  title="Zoom Out"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50"
                  title="Reset Layout & View"
                  aria-label="Reset layout"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={fetchData}
              className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50 ml-1"
              title="Refresh Graph Data"
              aria-label="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 3. Main Body: Interactive Canvas + Blast Radius Side Inspector */}
      {activeTab === 'graph' ? (
        <div className="grid gap-6 lg:grid-cols-4 items-start">
          {/* Interactive SVG Canvas (3 cols on large screen) */}
          <div className="lg:col-span-3 rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden relative shadow-inner">
            {/* Canvas overlay instructions */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
              <span className="text-[11px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-full backdrop-blur-sm">
                Click a service to analyze blast radius • Drag nodes to reposition
              </span>
            </div>

            {/* Legend overlay */}
            <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
              {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                <span
                  key={type}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </span>
              ))}
            </div>

            {/* SVG Canvas */}
            <div
              className="w-full h-[620px] cursor-grab active:cursor-grabbing overflow-hidden"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <svg
                ref={svgRef}
                className="w-full h-full select-none"
                viewBox={`0 0 ${canvasBounds.width} ${canvasBounds.height}`}
              >
                <defs>
                  {/* Arrowhead Markers */}
                  {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                    <marker
                      key={type}
                      id={`arrow-${type}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill={cfg.color} />
                    </marker>
                  ))}
                  <marker
                    id="arrow-blast"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
                  </marker>
                </defs>

                {/* Transform group for Pan & Zoom */}
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Background Grid Pattern (subtle dots) */}
                  <pattern id="grid-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#27272a" />
                  </pattern>
                  <rect width={canvasBounds.width * 2} height={canvasBounds.height * 2} fill="url(#grid-dots)" />

                  {/* 1. EDGES */}
                  {filteredEdges.map((edge) => {
                    const srcPos = nodePositions[edge.sourceServiceId];
                    const tgtPos = nodePositions[edge.targetServiceId];
                    if (!srcPos || !tgtPos) return null;

                    const x1 = srcPos.x + NODE_WIDTH;
                    const y1 = srcPos.y + NODE_HEIGHT / 2;
                    const x2 = tgtPos.x;
                    const y2 = tgtPos.y + NODE_HEIGHT / 2;

                    const cfg = TYPE_CONFIG[edge.dependencyType] || TYPE_CONFIG.sync;

                    // Check if edge is in active selection
                    const isDirectCallerEdge =
                      selectedServiceId &&
                      edge.targetServiceId === selectedServiceId;
                    const isDirectDependencyEdge =
                      selectedServiceId &&
                      edge.sourceServiceId === selectedServiceId;
                    const isBlastEdge =
                      selectedServiceId &&
                      blastSets.allAffected.has(edge.sourceServiceId) &&
                      (edge.targetServiceId === selectedServiceId ||
                        blastSets.allAffected.has(edge.targetServiceId));

                    const isDimmed =
                      selectedServiceId &&
                      !isDirectCallerEdge &&
                      !isDirectDependencyEdge &&
                      !isBlastEdge;

                    // Compute smooth curved Bézier path
                    const dx = Math.abs(x2 - x1) * 0.5;
                    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                    const strokeColor = isBlastEdge ? '#f43f5e' : cfg.color;
                    const strokeWidth = isBlastEdge || isDirectCallerEdge || isDirectDependencyEdge ? 2.5 : 1.5;
                    const markerId = isBlastEdge ? 'arrow-blast' : `arrow-${edge.dependencyType}`;

                    return (
                      <g
                        key={edge.dependencyId || `${edge.sourceServiceId}-${edge.targetServiceId}`}
                        className={cn('transition-opacity duration-200', isDimmed ? 'opacity-20' : 'opacity-90')}
                      >
                        <path
                          d={pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeDasharray={edge.dependencyType === 'async' ? '5 4' : undefined}
                          markerEnd={`url(#${markerId})`}
                        />
                        {/* Optional Failure Rate badge on edge midpoint */}
                        {edge.failureCount > 0 && (
                          <g transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2 - 8})`}>
                            <rect
                              x="-18"
                              y="-8"
                              width="36"
                              height="16"
                              rx="8"
                              fill="#881337"
                              stroke="#f43f5e"
                              strokeWidth="1"
                            />
                            <text
                              x="0"
                              y="3"
                              fill="#fecdd3"
                              fontSize="9"
                              fontWeight="600"
                              textAnchor="middle"
                            >
                              {Math.round((edge.failureRate || 0) * 100)}%
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* 2. NODES */}
                  {allNodeIds.map((nodeId) => {
                    const pos = nodePositions[nodeId];
                    if (!pos) return null;

                    const svc = servicesMap.get(nodeId) || { name: nodeId };
                    const IconComponent = getNodeIcon(svc.name);

                    const isSelected = selectedServiceId === nodeId;
                    const isDirectCaller = selectionRel.callers.has(nodeId);
                    const isDirectDependency = selectionRel.dependencies.has(nodeId);
                    const isDirectlyAffected = blastSets.direct.has(nodeId);
                    const isIndirectlyAffected = blastSets.indirect.has(nodeId);

                    const isHighlighted =
                      isSelected ||
                      isDirectCaller ||
                      isDirectDependency ||
                      isDirectlyAffected ||
                      isIndirectlyAffected;

                    const isDimmed = selectedServiceId && !isHighlighted;

                    // Visual node ring colors
                    let borderColor = 'border-zinc-800';
                    let ringClass = '';
                    let badgeColor = 'bg-zinc-800 text-zinc-400';
                    let badgeText = null;

                    if (isSelected) {
                      borderColor = 'border-emerald-500';
                      ringClass = 'ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20';
                    } else if (isDirectlyAffected) {
                      borderColor = 'border-rose-500';
                      ringClass = 'ring-2 ring-rose-500/60 shadow-lg shadow-rose-500/20 animate-pulse';
                      badgeColor = 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
                      badgeText = 'Direct Impact';
                    } else if (isIndirectlyAffected) {
                      borderColor = 'border-amber-500';
                      ringClass = 'ring-1 ring-amber-500/50';
                      badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
                      badgeText = 'Indirect Impact';
                    } else if (isDirectCaller) {
                      borderColor = 'border-amber-400/80';
                      badgeColor = 'bg-amber-500/10 text-amber-300';
                      badgeText = 'Caller';
                    } else if (isDirectDependency) {
                      borderColor = 'border-blue-400/80';
                      badgeColor = 'bg-blue-500/10 text-blue-300';
                      badgeText = 'Dependency';
                    }

                    return (
                      <g
                        key={nodeId}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onMouseDown={(e) => handleNodeMouseDown(e, nodeId)}
                        onClick={() => handleSelectService(nodeId)}
                        className={cn(
                          'cursor-pointer transition-opacity duration-200',
                          isDimmed ? 'opacity-25' : 'opacity-100'
                        )}
                      >
                        {/* ForeignObject allows standard HTML/Tailwind inside SVG */}
                        <foreignObject width={NODE_WIDTH} height={NODE_HEIGHT}>
                          <div
                            className={cn(
                              'h-full w-full rounded-lg bg-zinc-900/95 border p-2.5 flex flex-col justify-between select-none transition-all',
                              borderColor,
                              ringClass,
                              isSelected && 'bg-zinc-850'
                            )}
                          >
                            <div className="flex items-center justify-between gap-1.5 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <IconComponent
                                  className={cn(
                                    'h-4 w-4 flex-shrink-0',
                                    isSelected
                                      ? 'text-emerald-400'
                                      : isDirectlyAffected
                                      ? 'text-rose-400'
                                      : 'text-zinc-400'
                                  )}
                                />
                                <span className="text-xs font-semibold text-zinc-100 truncate">
                                  {svc.name}
                                </span>
                              </div>
                            </div>

                            {/* Node footer pill / status */}
                            <div className="flex items-center justify-between text-[10px] text-zinc-500">
                              {badgeText ? (
                                <span className={cn('px-1.5 py-0.2 rounded font-medium text-[9px]', badgeColor)}>
                                  {badgeText}
                                </span>
                              ) : (
                                <span className="font-mono text-zinc-500">
                                  {svc.environment || 'service'}
                                </span>
                              )}
                              <span className="text-zinc-600 font-mono">
                                {nodeId.slice(0, 6)}
                              </span>
                            </div>
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>

          {/* 4. Blast Radius Inspector Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-zinc-800 bg-zinc-900">
              <CardHeader className="pb-3 border-b border-zinc-800/80">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-rose-400" />
                    Blast Radius Inspector
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBlastRadius((prev) => !prev)}
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded border transition-colors',
                        showBlastRadius
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      )}
                      title="Toggle blast radius canvas highlights"
                    >
                      {showBlastRadius ? 'Highlights ON' : 'Highlights OFF'}
                    </button>
                    {selectedService && (
                      <button
                        type="button"
                        onClick={() => handleSelectService(null)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {!selectedService ? (
                  <div className="py-8 text-center text-zinc-500">
                    <Network className="h-8 w-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                    <p className="text-xs font-medium text-zinc-400">No service selected</p>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-[200px] mx-auto">
                      Click any service on the topology canvas to calculate its deterministic blast radius.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Selected Service Information */}
                    <div className="rounded-md bg-zinc-950/70 border border-zinc-800 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Box className="h-4 w-4 text-emerald-400" />
                        <h4 className="text-sm font-semibold text-zinc-100 truncate">
                          {selectedService.name}
                        </h4>
                      </div>
                      <p className="text-[10px] font-mono text-zinc-500 break-all">
                        {selectedService.serviceId}
                      </p>
                      {selectedService.version && (
                        <p className="text-xs text-zinc-400 mt-1">
                          Version: <span className="font-mono text-zinc-300">{selectedService.version}</span>
                        </p>
                      )}
                    </div>

                    {/* Blast Radius Calculation Result */}
                    {blastLoading ? (
                      <LoadingState message="Calculating blast radius…" className="p-6" />
                    ) : blastError ? (
                      <ErrorState title="Analysis Failed" message={blastError} className="p-4" />
                    ) : blastData ? (
                      <div className="space-y-4">
                        {/* Total Impact Score */}
                        <div className="rounded-md bg-rose-500/10 border border-rose-500/20 p-3 text-center">
                          <p className="text-xs font-medium text-rose-300 uppercase tracking-wider">
                            Total Impacted Services
                          </p>
                          <p className="text-3xl font-extrabold text-rose-400 mt-1">
                            {blastData.totalAffectedCount}
                          </p>
                          <p className="text-[10px] text-rose-400/80 mt-1">
                            Services affected if {selectedService.name} degrades or fails
                          </p>
                        </div>

                        {/* Direct Dependents */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-rose-500" />
                              Direct Dependents ({blastData.directlyAffected?.length || 0})
                            </span>
                          </div>
                          {blastData.directlyAffected?.length === 0 ? (
                            <p className="text-xs text-zinc-500 italic">None (no direct incoming callers)</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {blastData.directlyAffected.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => handleSelectService(id)}
                                  className="text-[11px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
                                >
                                  {servicesMap.get(id)?.name || id.slice(0, 8)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Indirect Transitive Callers */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-amber-500" />
                              Indirect Callers ({blastData.indirectlyAffected?.length || 0})
                            </span>
                          </div>
                          {blastData.indirectlyAffected?.length === 0 ? (
                            <p className="text-xs text-zinc-500 italic">No indirect upstream callers</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {blastData.indirectlyAffected.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => handleSelectService(id)}
                                  className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                                >
                                  {servicesMap.get(id)?.name || id.slice(0, 8)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Downstream Dependencies */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-blue-400" />
                              Downstream Dependencies ({blastData.downstreamServices?.length || 0})
                            </span>
                          </div>
                          {blastData.downstreamServices?.length === 0 ? (
                            <p className="text-xs text-zinc-500 italic">Leaf service (no downstream calls)</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {blastData.downstreamServices.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => handleSelectService(id)}
                                  className="text-[11px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                                >
                                  {servicesMap.get(id)?.name || id.slice(0, 8)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Failure Propagation Paths */}
                        {blastData.affectedPaths && blastData.affectedPaths.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-zinc-300 mb-1.5">Propagation Paths</p>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                              {blastData.affectedPaths.map((path, idx) => (
                                <div
                                  key={idx}
                                  className="text-[10px] font-mono bg-zinc-950 p-1.5 rounded border border-zinc-800 text-zinc-400 flex items-center gap-1 flex-wrap"
                                >
                                  {path.map((nodeId, pIdx) => (
                                    <span key={pIdx} className="flex items-center gap-1">
                                      <span
                                        className={cn(
                                          nodeId === selectedServiceId ? 'text-rose-400 font-bold' : 'text-zinc-300'
                                        )}
                                      >
                                        {servicesMap.get(nodeId)?.name || nodeId.slice(0, 6)}
                                      </span>
                                      {pIdx < path.length - 1 && (
                                        <ArrowRight className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* 5. Tabular Edge Matrix View */
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <List className="h-4 w-4 text-violet-400" />
                Dependency Edge Registry
              </span>
              <span className="text-xs font-normal text-zinc-500">
                {filteredEdges.length} connections
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEdges.length === 0 ? (
              <EmptyState
                icon={Network}
                title="No dependencies match"
                message="Adjust search query or filter pills to view edges."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Caller (Source)</th>
                      <th className="pb-3 pr-4">Target (Dependency)</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Requests</th>
                      <th className="pb-3 pr-4">Failures</th>
                      <th className="pb-3 pr-4">Failure Rate</th>
                      <th className="pb-3">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEdges.map((edge) => {
                      const srcName = servicesMap.get(edge.sourceServiceId)?.name || edge.sourceServiceId;
                      const tgtName = servicesMap.get(edge.targetServiceId)?.name || edge.targetServiceId;
                      const cfg = TYPE_CONFIG[edge.dependencyType] || TYPE_CONFIG.sync;
                      const failRate = Math.round((edge.failureRate || 0) * 100);

                      return (
                        <tr
                          key={edge.dependencyId || `${edge.sourceServiceId}:${edge.targetServiceId}`}
                          className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <span className="font-semibold text-zinc-200">{srcName}</span>
                            <span className="block text-[10px] font-mono text-zinc-500">
                              {edge.sourceServiceId.slice(0, 8)}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="font-semibold text-zinc-200">{tgtName}</span>
                            <span className="block text-[10px] font-mono text-zinc-500">
                              {edge.targetServiceId.slice(0, 8)}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
                                cfg.bg,
                                cfg.text,
                                cfg.border
                              )}
                            >
                              {edge.dependencyType}
                            </span>
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-zinc-300">
                            {edge.requestCount ?? 0}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-zinc-300">
                            {edge.failureCount ?? 0}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'font-mono text-xs font-semibold',
                                  failRate > 30
                                    ? 'text-rose-400'
                                    : failRate > 0
                                    ? 'text-amber-400'
                                    : 'text-zinc-400'
                                )}
                              >
                                {failRate}%
                              </span>
                              {failRate > 0 && (
                                <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      failRate > 30 ? 'bg-rose-500' : 'bg-amber-500'
                                    )}
                                    style={{ width: `${Math.min(100, failRate)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-xs text-zinc-500">
                            {formatTimestamp(edge.lastSeenAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
