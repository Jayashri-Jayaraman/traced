import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'


function App() {
  const [count, setCount] = useState(0)
const [currentStep, setCurrentStep] = useState(0)
const steps = ["Functional", "Non-Functional", "API Design", "High-Level", "Finish"];
  return (
   <div className="app">
    <header className="header">traced.</header>
    <aside className="sidebar">components go here</aside>
    <main className="canvas">canvas</main>
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
    <aside className="inspector">inspector</aside>
  </div>
  )
}

export default App
