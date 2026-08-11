import { useState } from 'react';
import './App.css';

function App() {
  // ── Stepper state ──
  const [currentStep, setCurrentStep] = useState(0);
  const steps = ["Functional", "Non-Functional", "API Design", "High-Level", "Finish"];

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

  // ── Canvas / dragging state ──
  const [nodes, setNodes] = useState([
    { id: 1, type: 'database', x: 100, y: 100 },
  ]);
  const [draggingId, setDraggingId] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function handleMouseDown(e, node) {
    setDraggingId(node.id);
    setOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
  }

  function handleMouseMove(e) {
    if (draggingId === null) return;
    setNodes(nodes.map(n =>
      n.id === draggingId
        ? { ...n, x: e.clientX - offset.x, y: e.clientY - offset.y }
        : n
    ));
  }

  function handleMouseUp() {
    setDraggingId(null);
  }

  return (
    <div className="app">
      <header className="header">traced.</header>

      <aside className="sidebar">
        components go here

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
        className="canvas"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {nodes.map(node => (
          <div
            key={node.id}
            className="node"
            style={{ left: node.x, top: node.y, position: 'absolute' }}
            onMouseDown={(e) => handleMouseDown(e, node)}
          >
            {node.type}
          </div>
        ))}
      </main>

      <aside className="inspector">inspector</aside>

      <div className="stepper">
        {steps.map((label, index) => (
          <div
            key={index}
            className={index === currentStep ? "step active" : "step"}
            onClick={() => setCurrentStep(index)}
          >
            <div className="step-circle">{index + 1}</div>
            <div className="step-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;