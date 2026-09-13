import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initFrontendSentry, Sentry } from './utils/sentry';
import { initPostHog } from './utils/analytics';

// Initialize observability clients
initFrontendSentry();
initPostHog();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><h2>Something went wrong</h2><p>Our editorial desk has been notified.</p></div>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
