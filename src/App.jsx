import { useState, useEffect, useRef } from 'react';
import './App.css';

const STORAGE_KEY = 'traced-state-v1';
const NODE_WIDTH = 120;
const NODE_HEIGHT = 48;

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
    placeholder: 'Use the canvas below to sketch your architecture. Add any extra notes here.',
  },
  {
    label: 'Finish',
    title: 'Finish',
    placeholder: '',
  },
];

const DEFAULT_NODES = [{ id: 1, type: 'database', label: 'database', x: 100, y: 100 }];
const DEFAULT_EDGES = [];
const DEFAULT_ANSWERS = { 0: '', 1: '', 2: '', 3: '' };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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

function App() {
  const saved = loadState();

  // ── Stepper state ──
  const [currentStep, setCurrentStep] = useState(saved?.currentStep ?? 0);
  const [stepAnswers, setStepAnswers] = useState(saved?.stepAnswers ?? DEFAULT_ANSWERS);

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

  const componentTypes = ['client', 'service', 'database', 'cache'];

  // ── Persist to localStorage ──
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ currentStep, stepAnswers, nodes, edges })
      );
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [currentStep, stepAnswers, nodes, edges]);

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

  function addNode(type) {
    const newNode = {
      id: Date.now(),
      type,
      label: type,
      x: 60 + ((nodes.length * 30) % 300),
      y: 60 + ((nodes.length * 30) % 200),
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  }

  function renameNode(id, label) {
    setNodes(nodes.map(n => (n.id === id ? { ...n, label } : n)));
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

  function resetAll() {
    if (!window.confirm('Clear the entire diagram and notes? This cannot be undone.')) return;
    setNodes(DEFAULT_NODES);
    setEdges(DEFAULT_EDGES);
    setStepAnswers(DEFAULT_ANSWERS);
    setCurrentStep(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectingFrom(null);
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
        <button className="reset-btn" onClick={resetAll}>Reset</button>
      </header>

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
          {componentTypes.map(type => (
            <button key={type} className="palette-btn" onClick={() => addNode(type)}>
              {type}
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
              <path d="M0,0 L10,5 L0,10 z" fill="#9B5DE5" />
            </marker>
            <marker id="arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#FF6B6B" />
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
        </svg>

        {nodes.map(node => {
          const isSelected = node.id === selectedNodeId;
          const isConnectSource = node.id === connectingFrom;
          const isConnectTarget = connectingFrom !== null && connectingFrom !== node.id;
          return (
            <div
              key={node.id}
              className={[
                'node',
                isSelected ? 'selected' : '',
                isConnectSource ? 'connect-source' : '',
                isConnectTarget ? 'connect-target' : '',
              ].join(' ').trim()}
              style={{ left: node.x, top: node.y }}
              onMouseDown={(e) => handleMouseDown(e, node)}
              onClick={(e) => handleNodeClick(e, node)}
            >
              {node.label}
            </div>
          );
        })}
      </main>

      <aside className="inspector">
        <h3>Inspector</h3>
        {selectedNode ? (
          <div className="inspector-panel">
            <label>Type</label>
            <div className="inspector-type">{selectedNode.type}</div>

            <label htmlFor="node-label">Label</label>
            <input
              id="node-label"
              value={selectedNode.label}
              onChange={(e) => renameNode(selectedNode.id, e.target.value)}
            />

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
