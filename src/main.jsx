import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import telemetry from './utils/telemetry.js'

// Start boot timer
telemetry.startTimer('app_boot');



console.log('🟢 MAIN.JSX RUNNING');

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

