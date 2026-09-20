import { useState, useEffect, useRef } from 'react';
import './App.css';
import { signup, login, clearSession, getStoredUser, listDesigns, getDesign, createDesign, updateDesign } from './api';

const STORAGE_KEY = 'traced-state-v1';
const NODE_WIDTH = 132;
const NODE_HEIGHT = 50;
const TICK_MS = 150;
const STATS_WINDOW_MS = 2000;
const MAX_HOPS = 8;

const STEPS = [
  {
    label: 'Functional',
    title: 'Functional Requirements',
    placeholder: 'What must the system do? e.g. shorten a URL, redirect a short code to the original URL…',
  },
  {
    label: 'Non-Functional',
    title: 'Non-Functional Requirements',
    placeholder: 'Scale, latency, availability, consistency, durability…',
  },
  {
    label: 'API Design',
    title: 'API Design',
    placeholder: 'Define your endpoints, e.g. POST /shorten, GET /:code',
  },
  {
    label: 'High-Level',
    title: 'High-Level Design',
    placeholder: 'Use the canvas below to sketch your architecture, then tune each component\'s parameters and run the live simulation.',
  },
  {
    label: 'Finish',
    title: 'Finish',
    placeholder: '',
  },
];

// ── Component catalog: colors + tunable parameters that drive the simulation ──
const NODE_TYPES = {
  client: {
    label: 'Client',
    color: '#2563EB',
    params: [
      { key: 'rps', label: 'Requests / sec', min: 1, max: 500, step: 1, default: 20 },
    ],
  },
  gateway: {
    label: 'API Gateway',
    color: '#0EA5E9',
    params: [
      { key: 'latencyMs', label: 'Latency (ms)', min: 1, max: 200, step: 1, default: 5 },
      { key: 'capacity', label: 'Capacity (req/s)', min: 10, max: 2000, step: 10, default: 500 },
    ],
  },
  'load-balancer': {
    label: 'Load Balancer',
    color: '#0891B2',
    params: [
      { key: 'latencyMs', label: 'Latency (ms)', min: 1, max: 50, step: 1, default: 2 },
      { key: 'capacity', label: 'Capacity (req/s)', min: 10, max: 5000, step: 10, default: 1000 },
    ],
  },
  service: {
    label: 'Service',
    color: '#16A34A',
    params: [
      { key: 'latencyMs', label: 'Latency (ms)', min: 1, max: 500, step: 1, default: 30 },
      { key: 'capacity', label: 'Capacity (req/s)', min: 10, max: 2000, step: 10, default: 200 },
      { key: 'instances', label: 'Instances', min: 1, max: 20, step: 1, default: 1 },
    ],
  },
  cache: {
    label: 'Cache',
    color: '#D97706',
    params: [
      { key: 'latencyMs', label: 'Latency (ms)', min: 1, max: 20, step: 1, default: 1 },
      { key: 'hitRate', label: 'Hit rate (%)', min: 0, max: 100, step: 1, default: 80 },
      { key: 'capacity', label: 'Capacity (req/s)', min: 10, max: 5000, step: 10, default: 2000 },
    ],
  },
  queue: {
    label: 'Message Queue',
    color: '#7C3AED',
    params: [
      { key: 'latencyMs', label: 'Enqueue latency (ms)', min: 1, max: 100, step: 1, default: 5 },
      { key: 'capacity', label: 'Capacity (msg/s)', min: 10, max: 5000, step: 10, default: 1000 },
    ],
  },
  database: {
    label: 'Database',
    color: '#DC2626',
    params: [
      { key: 'latencyMs', label: 'Query latency (ms)', min: 1, max: 500, step: 1, default: 15 },
      { key: 'capacity', label: 'Capacity (req/s)', min: 10, max: 2000, step: 10, default: 300 },
      { key: 'replicas', label: 'Replicas', min: 1, max: 10, step: 1, default: 1 },
    ],
  },
  cdn: {
    label: 'CDN',
    color: '#0D9488',
    params: [
      { key: 'latencyMs', label: 'Edge latency (ms)', min: 1, max: 50, step: 1, default: 8 },
      { key: 'hitRate', label: 'Hit rate (%)', min: 0, max: 100, step: 1, default: 90 },
      { key: 'capacity', label: 'Capacity (req/s)', min: 10, max: 10000, step: 10, default: 5000 },
    ],
  },
};

const COMPONENT_ORDER = ['client', 'gateway', 'load-balancer', 'service', 'cache', 'queue', 'database', 'cdn'];

function getDefaultParams(type) {
  const def = NODE_TYPES[type];
  if (!def) return {};
  return Object.fromEntries(def.params.map(p => [p.key, p.default]));
}

function normalizeNode(node) {
  return { ...node, params: { ...getDefaultParams(node.type), ...(node.params || {}) } };
}

const DEFAULT_NODES = [
  normalizeNode({ id: 1, type: 'database', label: NODE_TYPES.database.label, x: 100, y: 100 }),
];
const DEFAULT_EDGES = [];
const DEFAULT_ANSWERS = { 0: '', 1: '', 2: '', 3: '' };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.nodes)) parsed.nodes = parsed.nodes.map(normalizeNode);
    return parsed;
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nodeCenter(node) {
  return { cx: node.x + NODE_WIDTH / 2, cy: node.y + NODE_HEIGHT / 2 };
}

// Point where a ray from a node's center toward (dx, dy) exits its rectangle border.
function borderPoint(cx, cy, dx, dy) {
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = NODE_WIDTH / 2;
  const hh = NODE_HEIGHT / 2;
  const scale = Math.min(
    dx !== 0 ? hw / Math.abs(dx) : Infinity,
    dy !== 0 ? hh / Math.abs(dy) : Infinity
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

// A node's max sustained throughput before it's considered overloaded.
function effectiveCapacity(node) {
  const p = node?.params || {};
  if (typeof p.capacity !== 'number') return Infinity;
  return p.capacity * (p.instances || p.replicas || 1);
}

// Time a request spends at a node: its base latency, a cache-miss penalty, and a queueing
// penalty when the node is already over capacity.
function segmentLatency(node, overloaded) {
  if (!node) return 10;
  const base = node.params?.latencyMs ?? 10;
  let latency = base;
  if ((node.type === 'cache' || node.type === 'cdn') && typeof node.params?.hitRate === 'number') {
    const isHit = Math.random() * 100 < node.params.hitRate;
    latency = isHit ? base : base + 40;
  }
  return overloaded ? latency * 3 : latency;
}

function App() {
  const saved = loadState();

  // ── Stepper state ──
  const [currentStep, setCurrentStep] = useState(saved?.currentStep ?? 0);
  const [stepAnswers, setStepAnswers] = useState(saved?.stepAnswers ?? DEFAULT_ANSWERS);

  // ── Account / cloud sync state ──
  const [user, setUser] = useState(getStoredUser());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [designId, setDesignId] = useState(saved?.designId ?? null);
  const [designName, setDesignName] = useState(saved?.designName ?? 'Untitled design');
  const [cloudStatus, setCloudStatus] = useState('');
  const [designList, setDesignList] = useState(null);
  const [designListOpen, setDesignListOpen] = useState(false);

  // ── Hints state (each hint tracks its own open/closed) ──
  const [hints, setHints] = useState([
    { text: "Think about how you'd generate a unique short code.", open: false },
    { text: "Consider what happens if two users shorten the same URL.", open: false },
    { text: "How would you handle a short code that doesn't exist?", open: false },
  ]);

  function toggleHint(index) {
    setHints(hints.map((hint, i) =>
      i === index ? { ...hint, open: !hint.open } : hint
    ));
  }

  // ── Canvas / node state ──
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState(saved?.nodes ?? DEFAULT_NODES);
  const [edges, setEdges] = useState(saved?.edges ?? DEFAULT_EDGES);
  const [draggingId, setDraggingId] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [validationResult, setValidationResult] = useState(null);

  // ── Live simulation state ──
  const [simActive, setSimActive] = useState(false);
  const [particles, setParticles] = useState([]);
  const [nodeLoads, setNodeLoads] = useState({});
  const [liveStats, setLiveStats] = useState({ rps: 0, avgLatency: 0, completed: 0 });

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const particlesRef = useRef([]);
  const nodeLoadsRef = useRef({});
  const spawnAccRef = useRef({});
  const completedRef = useRef([]);
  const totalCompletedRef = useRef(0);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Persist to localStorage ──
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ currentStep, stepAnswers, nodes, edges, designId, designName })
      );
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [currentStep, stepAnswers, nodes, edges, designId, designName]);

  // ── Delete / Escape keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        setConnectingFrom(null);
        return;
      }
      if (isTyping) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId !== null) deleteNode(selectedNodeId);
        else if (selectedEdgeId !== null) deleteEdge(selectedEdgeId);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // ── Live simulation engine: spawns requests at each client, walks them across
  // edges hop by hop, and tracks per-node load + rolling throughput/latency stats. ──
  useEffect(() => {
    if (!simActive) {
      particlesRef.current = [];
      setParticles([]);
      nodeLoadsRef.current = {};
      setNodeLoads({});
      spawnAccRef.current = {};
      completedRef.current = [];
      totalCompletedRef.current = 0;
      setLiveStats({ rps: 0, avgLatency: 0, completed: 0 });
      return;
    }

    function tick() {
      const now = performance.now();
      const currentNodes = nodesRef.current;
      const adjacency = {};
      edgesRef.current.forEach(e => {
        (adjacency[e.from] ||= []).push(e.to);
      });

      function spawnSegment(fromId, path) {
        const outgoing = adjacency[fromId] || [];
        if (outgoing.length === 0) return null;
        const nextId = outgoing[Math.floor(Math.random() * outgoing.length)];
        const nextNode = currentNodes.find(n => n.id === nextId);
        const overloaded = (nodeLoadsRef.current[nextId] || 0) > effectiveCapacity(nextNode);
        return {
          id: `${now}-${Math.random().toString(36).slice(2)}`,
          path: [...path, nextId],
          segStart: now,
          segDuration: Math.max(20, segmentLatency(nextNode, overloaded)),
          latencyAcc: path.latencyAcc || 0,
        };
      }

      const newParticles = [];
      currentNodes.filter(n => n.type === 'client').forEach(client => {
        const rps = client.params?.rps ?? 10;
        spawnAccRef.current[client.id] = (spawnAccRef.current[client.id] || 0) + rps * (TICK_MS / 1000);
        while (spawnAccRef.current[client.id] >= 1) {
          spawnAccRef.current[client.id] -= 1;
          const particle = spawnSegment(client.id, [client.id]);
          if (particle) newParticles.push(particle);
        }
      });

      const loadCounts = {};
      const stillActive = [];
      const completedThisTick = [];

      particlesRef.current.forEach(p => {
        const targetId = p.path[p.path.length - 1];
        loadCounts[targetId] = (loadCounts[targetId] || 0) + 1;
        if (now - p.segStart < p.segDuration) {
          stillActive.push(p);
          return;
        }
        const newLatency = p.latencyAcc + p.segDuration;
        if ((adjacency[targetId] || []).length === 0 || p.path.length >= MAX_HOPS) {
          completedThisTick.push(newLatency);
          return;
        }
        const next = spawnSegment(targetId, p.path);
        if (next) stillActive.push({ ...next, latencyAcc: newLatency });
        else completedThisTick.push(newLatency);
      });

      newParticles.forEach(p => {
        const targetId = p.path[p.path.length - 1];
        loadCounts[targetId] = (loadCounts[targetId] || 0) + 1;
      });

      const merged = stillActive.concat(newParticles);
      particlesRef.current = merged;
      setParticles(merged);

      const loads = {};
      currentNodes.forEach(n => {
        loads[n.id] = Math.round((loadCounts[n.id] || 0) * (1000 / TICK_MS));
      });
      nodeLoadsRef.current = loads;
      setNodeLoads(loads);

      if (completedThisTick.length) {
        totalCompletedRef.current += completedThisTick.length;
        completedRef.current.push(...completedThisTick.map(l => ({ l, t: now })));
      }
      completedRef.current = completedRef.current.filter(e => now - e.t <= STATS_WINDOW_MS);
      const recent = completedRef.current;
      const avgLatency = recent.length ? recent.reduce((s, e) => s + e.l, 0) / recent.length : 0;
      setLiveStats({
        rps: Math.round(recent.length / (STATS_WINDOW_MS / 1000)),
        avgLatency: Math.round(avgLatency),
        completed: totalCompletedRef.current,
      });
    }

    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [simActive]);

  function addNode(type) {
    const def = NODE_TYPES[type];
    const newNode = {
      id: Date.now(),
      type,
      label: def?.label ?? type,
      x: 60 + ((nodes.length * 30) % 300),
      y: 60 + ((nodes.length * 30) % 200),
      params: getDefaultParams(type),
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  }

  function renameNode(id, label) {
    setNodes(nodes.map(n => (n.id === id ? { ...n, label } : n)));
  }

  function updateNodeParam(id, key, value) {
    setNodes(prev => prev.map(n => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)));
  }

  function deleteNode(id) {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    setSelectedNodeId(null);
    setConnectingFrom(prev => (prev === id ? null : prev));
  }

  function addEdge(fromId, toId) {
    setEdges(prev => {
      if (prev.some(e => e.from === fromId && e.to === toId)) return prev;
      return [...prev, { id: Date.now(), from: fromId, to: toId }];
    });
  }

  function deleteEdge(id) {
    setEdges(prev => prev.filter(e => e.id !== id));
    setSelectedEdgeId(null);
  }

  function handleMouseDown(e, node) {
    e.stopPropagation();
    if (connectingFrom !== null) return;
    setDraggingId(node.id);
    const rect = canvasRef.current.getBoundingClientRect();
    setOffset({ x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y });
  }

  function handleMouseMove(e) {
    if (draggingId === null) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - NODE_WIDTH);
    const maxY = Math.max(0, rect.height - NODE_HEIGHT);
    const x = clamp(e.clientX - rect.left - offset.x, 0, maxX);
    const y = clamp(e.clientY - rect.top - offset.y, 0, maxY);
    setNodes(nodes.map(n => (n.id === draggingId ? { ...n, x, y } : n)));
  }

  function handleMouseUp() {
    setDraggingId(null);
  }

  function handleNodeClick(e, node) {
    e.stopPropagation();
    if (connectingFrom !== null) {
      if (connectingFrom !== node.id) addEdge(connectingFrom, node.id);
      setConnectingFrom(null);
      return;
    }
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function handleCanvasClick() {
    setConnectingFrom(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  function handleEdgeClick(e, edge) {
    e.stopPropagation();
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }

  function startConnecting(nodeId) {
    setConnectingFrom(prev => (prev === nodeId ? null : nodeId));
  }

  function setAnswer(step, value) {
    setStepAnswers(prev => ({ ...prev, [step]: value }));
  }

  function runValidation() {
    const checks = [];
    const types = new Set(nodes.map(n => n.type));
    const connectedIds = new Set(edges.flatMap(e => [e.from, e.to]));
    const isolated = nodes.filter(n => nodes.length > 1 && !connectedIds.has(n.id));

    checks.push(
      nodes.length > 0
        ? { level: 'pass', message: `${nodes.length} component${nodes.length === 1 ? '' : 's'} on the canvas.` }
        : { level: 'fail', message: 'Add at least one component to the canvas.' }
    );
    checks.push(
      types.has('client')
        ? { level: 'pass', message: 'A client entry point is present.' }
        : { level: 'warn', message: 'No client component — where do requests come from?' }
    );
    checks.push(
      types.has('database')
        ? { level: 'pass', message: 'A database is present for persistence.' }
        : { level: 'warn', message: 'No database — how is data persisted?' }
    );
    checks.push(
      edges.length > 0
        ? { level: 'pass', message: `${edges.length} connection${edges.length === 1 ? '' : 's'} between components.` }
        : { level: 'fail', message: 'No connections yet — link your components together.' }
    );
    if (isolated.length > 0) {
      checks.push({
        level: 'fail',
        message: `Isolated component${isolated.length === 1 ? '' : 's'} with no connections: ${isolated.map(n => n.label).join(', ')}.`,
      });
    }

    setValidationResult(checks);
  }

  function toggleSimulation() {
    setSimActive(prev => !prev);
  }

  function resetAll() {
    if (!window.confirm('Clear the entire diagram and notes? This cannot be undone.')) return;
    setSimActive(false);
    setNodes(DEFAULT_NODES);
    setEdges(DEFAULT_EDGES);
    setStepAnswers(DEFAULT_ANSWERS);
    setCurrentStep(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectingFrom(null);
    setValidationResult(null);
  }

  // ── Account / cloud sync handlers ──
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const auth = authMode === 'login'
        ? await login(authEmail, authPassword)
        : await signup(authEmail, authPassword, authDisplayName || authEmail);
      setUser({ email: auth.email, displayName: auth.displayName });
      setAuthOpen(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthDisplayName('');

      // Load the most recently saved design, if any, for this account.
      try {
        const list = await listDesigns();
        if (list.length > 0) {
          await handleLoadDesign(list[0].id);
        }
      } catch {
        // non-fatal: stay on the current local design
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setDesignId(null);
    setDesignList(null);
    setDesignListOpen(false);
    setCloudStatus('');
  }

  async function handleSaveToCloud() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setCloudStatus('saving');
    const payload = { name: designName || 'Untitled design', currentStep, stepAnswers, nodes, edges };
    try {
      const result = designId ? await updateDesign(designId, payload) : await createDesign(payload);
      setDesignId(result.id);
      setCloudStatus('saved');
      setDesignList(null);
    } catch {
      setCloudStatus('error');
    }
  }

  async function toggleDesignList() {
    const opening = !designListOpen;
    setDesignListOpen(opening);
    if (opening && !designList) {
      try {
        setDesignList(await listDesigns());
      } catch {
        setDesignList([]);
      }
    }
  }

  async function handleLoadDesign(id) {
    try {
      const design = await getDesign(id);
      setDesignId(design.id);
      setDesignName(design.name);
      setCurrentStep(design.currentStep);
      setStepAnswers(design.stepAnswers);
      setNodes((design.nodes || []).map(normalizeNode));
      setEdges(design.edges || []);
      setDesignListOpen(false);
    } catch {
      setCloudStatus('error');
    }
  }

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find(e => e.id === selectedEdgeId) ?? null;
  const edgeFromNode = selectedEdge ? nodes.find(n => n.id === selectedEdge.from) : null;
  const edgeToNode = selectedEdge ? nodes.find(n => n.id === selectedEdge.to) : null;
  const step = STEPS[currentStep];

  return (
    <div className="app">
      <header className="header">
        traced.
        <div className="header-actions">
          {user ? (
            <>
              <input
                className="design-name-input"
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                placeholder="Design name"
              />
              <div className="design-load-wrap">
                <button className="cloud-btn" onClick={toggleDesignList}>My Designs ▾</button>
                {designListOpen && (
                  <div className="design-list-dropdown">
                    {designList === null ? (
                      <div className="design-list-empty">Loading…</div>
                    ) : designList.length === 0 ? (
                      <div className="design-list-empty">No saved designs yet.</div>
                    ) : (
                      designList.map((d) => (
                        <button key={d.id} className="design-list-item" onClick={() => handleLoadDesign(d.id)}>
                          {d.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button className="cloud-btn" onClick={handleSaveToCloud} disabled={cloudStatus === 'saving'}>
                {cloudStatus === 'saving' ? 'Saving…' : cloudStatus === 'saved' ? 'Saved ✓' : 'Save to Cloud'}
              </button>
              <span className="account-name">{user.displayName}</span>
              <button className="reset-btn" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <button className="cloud-btn" onClick={() => setAuthOpen(true)}>Log in / Sign up</button>
          )}
          <button className="validate-btn" onClick={runValidation}>Validate</button>
          <button className={`sim-btn${simActive ? ' active' : ''}`} onClick={toggleSimulation}>
            {simActive ? '■ Stop Simulation' : '▶ Start Simulation'}
          </button>
          <button className="reset-btn" onClick={resetAll}>Reset</button>
        </div>
      </header>

      {authOpen && (
        <div className="modal-overlay" onClick={() => setAuthOpen(false)}>
          <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="validation-header">
              <span>{authMode === 'login' ? 'Log in' : 'Sign up'}</span>
              <button className="validation-close" onClick={() => setAuthOpen(false)}>×</button>
            </div>
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
              {authMode === 'signup' && (
                <>
                  <label htmlFor="auth-name">Display name</label>
                  <input
                    id="auth-name"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    required
                  />
                </>
              )}
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                minLength={authMode === 'signup' ? 8 : undefined}
                required
              />
              {authError && <div className="auth-error">{authError}</div>}
              <button type="submit" className="btn-connect" disabled={authBusy}>
                {authBusy ? 'Please wait…' : authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
              <button
                type="button"
                className="auth-switch"
                onClick={() => { setAuthMode((m) => (m === 'login' ? 'signup' : 'login')); setAuthError(''); }}
              >
                {authMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
              </button>
            </form>
          </div>
        </div>
      )}

      <section className="step-content">
        <h2>{step.title}</h2>
        {currentStep < 4 ? (
          <textarea
            className="step-textarea"
            placeholder={step.placeholder}
            value={stepAnswers[currentStep] ?? ''}
            onChange={(e) => setAnswer(currentStep, e.target.value)}
          />
        ) : (
          <div className="finish-summary">
            {STEPS.slice(0, 3).map((s, i) => (
              <div key={i} className="finish-item">
                <strong>{s.title}:</strong>
                <span>{stepAnswers[i]?.trim() ? stepAnswers[i] : '(not filled in)'}</span>
              </div>
            ))}
            <div className="finish-item">
              <strong>High-Level Design:</strong>
              <span>{nodes.length} components · {edges.length} connections</span>
            </div>
          </div>
        )}
      </section>

      <aside className="sidebar">
        <div className="palette">
          {COMPONENT_ORDER.map(type => (
            <button
              key={type}
              className="palette-btn"
              style={{ '--swatch': NODE_TYPES[type].color }}
              onClick={() => addNode(type)}
            >
              <span className="palette-swatch" />
              {NODE_TYPES[type].label}
            </button>
          ))}
        </div>

        <div className="hints">
          {hints.map((hint, index) => (
            <div key={index} className="hint">
              <div className="hint-header" onClick={() => toggleHint(index)}>
                <span>Hint {index + 1}</span>
                <span>{hint.open ? '−' : '+'}</span>
              </div>
              {hint.open && <div className="hint-body">{hint.text}</div>}
            </div>
          ))}
        </div>
      </aside>

      <main
        className={`canvas${connectingFrom !== null ? ' connecting' : ''}`}
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
      >
        <svg className="edge-layer">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#94A3B8" />
            </marker>
            <marker id="arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#DC2626" />
            </marker>
          </defs>
          {edges.map(edge => {
            const from = nodes.find(n => n.id === edge.from);
            const to = nodes.find(n => n.id === edge.to);
            if (!from || !to) return null;
            const a = nodeCenter(from);
            const b = nodeCenter(to);
            const dx = b.cx - a.cx;
            const dy = b.cy - a.cy;
            const start = borderPoint(a.cx, a.cy, dx, dy);
            const end = borderPoint(b.cx, b.cy, -dx, -dy);
            const isSelected = edge.id === selectedEdgeId;
            return (
              <g key={edge.id} onClick={(e) => handleEdgeClick(e, edge)} className="edge-group">
                <line
                  x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  className="edge-hit"
                />
                <line
                  x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  className={`edge-line${isSelected ? ' selected' : ''}`}
                  markerEnd={`url(#${isSelected ? 'arrow-selected' : 'arrow'})`}
                />
              </g>
            );
          })}
          {particles.map(p => {
            const toNode = nodes.find(n => n.id === p.path[p.path.length - 1]);
            if (!toNode) return null;
            const c = nodeCenter(toNode);
            return (
              <circle
                key={p.id}
                className="particle"
                r="4"
                cx={c.cx}
                cy={c.cy}
                style={{ transitionDuration: `${p.segDuration}ms` }}
              />
            );
          })}
        </svg>

        {nodes.map(node => {
          const isSelected = node.id === selectedNodeId;
          const isConnectSource = node.id === connectingFrom;
          const isConnectTarget = connectingFrom !== null && connectingFrom !== node.id;
          const load = nodeLoads[node.id] ?? 0;
          const isOverloaded = simActive && load > effectiveCapacity(node);
          return (
            <div
              key={node.id}
              className={[
                'node',
                isSelected ? 'selected' : '',
                isConnectSource ? 'connect-source' : '',
                isConnectTarget ? 'connect-target' : '',
                isOverloaded ? 'overloaded' : '',
              ].join(' ').trim()}
              style={{ left: node.x, top: node.y, background: NODE_TYPES[node.type]?.color ?? '#64748B' }}
              onMouseDown={(e) => handleMouseDown(e, node)}
              onClick={(e) => handleNodeClick(e, node)}
            >
              <span className="node-label">{node.label}</span>
              {simActive && <span className={`node-load${isOverloaded ? ' overloaded' : ''}`}>{load} req/s</span>}
            </div>
          );
        })}

        {simActive && (
          <div className="live-stats-panel" onClick={(e) => e.stopPropagation()}>
            <div className="live-stats-title"><span className="live-dot" />Live Simulation</div>
            <div className="live-stats-row"><span>Throughput</span><strong>{liveStats.rps} req/s</strong></div>
            <div className="live-stats-row"><span>Avg latency</span><strong>{liveStats.avgLatency} ms</strong></div>
            <div className="live-stats-row"><span>Completed</span><strong>{liveStats.completed}</strong></div>
          </div>
        )}

        {validationResult && (
          <div className="validation-panel" onClick={(e) => e.stopPropagation()}>
            <div className="validation-header">
              <span>Validation</span>
              <button className="validation-close" onClick={() => setValidationResult(null)}>×</button>
            </div>
            <ul className="validation-list">
              {validationResult.map((check, i) => (
                <li key={i} className={`validation-item ${check.level}`}>{check.message}</li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <aside className="inspector">
        <h3>Inspector</h3>
        {selectedNode ? (
          <div className="inspector-panel">
            <label>Type</label>
            <div className="inspector-type">{NODE_TYPES[selectedNode.type]?.label ?? selectedNode.type}</div>

            <label htmlFor="node-label">Label</label>
            <input
              id="node-label"
              value={selectedNode.label}
              onChange={(e) => renameNode(selectedNode.id, e.target.value)}
            />

            {NODE_TYPES[selectedNode.type]?.params.map(field => (
              <div className="param-field" key={field.key}>
                <label htmlFor={`param-${field.key}`}>
                  {field.label}
                  <span className="param-value">{selectedNode.params?.[field.key] ?? field.default}</span>
                </label>
                <input
                  id={`param-${field.key}`}
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={selectedNode.params?.[field.key] ?? field.default}
                  onChange={(e) => updateNodeParam(selectedNode.id, field.key, Number(e.target.value))}
                />
              </div>
            ))}

            {simActive && (
              <div className="param-field">
                <label>Live load</label>
                <div className="inspector-type">{nodeLoads[selectedNode.id] ?? 0} req/s</div>
              </div>
            )}

            <button className="btn-connect" onClick={() => startConnecting(selectedNode.id)}>
              {connectingFrom === selectedNode.id ? 'Click a node… (Esc to cancel)' : 'Connect to…'}
            </button>
            <button className="btn-danger" onClick={() => deleteNode(selectedNode.id)}>
              Delete node
            </button>
          </div>
        ) : selectedEdge ? (
          <div className="inspector-panel">
            <label>Connection</label>
            <div className="inspector-type">
              {edgeFromNode?.label ?? '?'} → {edgeToNode?.label ?? '?'}
            </div>
            <button className="btn-danger" onClick={() => deleteEdge(selectedEdge.id)}>
              Delete connection
            </button>
          </div>
        ) : (
          <p className="inspector-empty">
            Select a node or connection to inspect it.
            <br />
            {nodes.length} components · {edges.length} connections
          </p>
        )}
      </aside>

      <div className="stepper">
        {STEPS.map((s, index) => (
          <div
            key={index}
            className={index === currentStep ? 'step active' : 'step'}
            onClick={() => setCurrentStep(index)}
          >
            <div className="step-circle">{index + 1}</div>
            <div className="step-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
