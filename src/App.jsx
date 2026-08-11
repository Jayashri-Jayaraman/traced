import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'


function App() {
  const [count, setCount] = useState(0)
const [currentStep, setCurrentStep] = useState(0)
const steps = ["Functional", "Non-Functional", "API Design", "High-Level", "Finish"];
const [hints, setHints] = useState([
  { text: "Think about how you'd generate a unique short code.", open: false },
  { text: "Consider what happens if two users shorten the same URL.", open: false },
  { text: "How would you handle a short code that doesn't exist?", open: false },
]); 
function toggleHint(index) {
    setHints(hints.map((hint, i) => (i === index ? { ...hint, open: !hint.open } : hint)));
}
  return (
   <div className="app">

    <header className="header">traced.</header>
    <aside className="sidebar">components go here</aside>
    <main className="canvas">canvas</main>
    <div className="stepper">
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
    <aside className="inspector">inspector</aside>
  </div>
  )
}

export default App
