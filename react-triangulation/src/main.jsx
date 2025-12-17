import React from 'react'
import { createRoot } from 'react-dom/client'
import EvaluationSystem from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EvaluationSystem />
  </React.StrictMode>
)
