import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import telemetry from './utils/telemetry.js'

// Start boot timer
telemetry.startTimer('app_boot');

// VERSION STAMP — remove after confirming correct deployment
console.log('%cMMC WEB BUILD 2c56b4c — 2026-02-21', 'color:#00f0ff;font-weight:bold;font-size:14px');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// End boot timer after initial mount
setTimeout(() => {
  telemetry.endTimer('app_boot');
}, 0);

