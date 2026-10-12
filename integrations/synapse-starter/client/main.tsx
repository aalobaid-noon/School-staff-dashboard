import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import { ConsoleApp } from './console/ConsoleApp';
import { useSynapseMode } from './useSynapseMode';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

// The single hinge of the two-part split: probe whether we're in the workspace (render the builder
// console) or a published deployment (render the shipped app).
function Root() {
  const mode = useSynapseMode();
  if (mode === 'probing') {
    return <Splash />;
  }
  return mode === 'workspace' ? <ConsoleApp /> : <AppShell />;
}

// Brand-neutral holding screen for the one-request probe, so end users never glimpse console chrome.
function Splash() {
  return <div className="min-h-screen bg-slate-50" aria-hidden />;
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
