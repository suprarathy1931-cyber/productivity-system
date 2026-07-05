import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { db } from './lib/db'
import { startSyncScheduler } from './lib/sync'

// Start the background sync engine once, at app startup, for every
// table currently defined. As more modules get built, their tables
// get added to this array — the scheduler itself doesn't change.
startSyncScheduler([
  { table: db.breath_sessions, apiPath: '/breath-sessions', hasUpdatedAt: true },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
