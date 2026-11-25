import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
async function start() {
  // The MSW mock is this app's only backend (the brief has no real server),
  // so the worker must start in production too, not only in dev.
  const { worker } = await import('./mocks/browser'); await worker.start({ onUnhandledRequest: 'bypass' });
  createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
}
start();
