
import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { isFirebaseConfigured } from './lib/firebase';
import { FirebaseConfigError } from './components/FirebaseConfigError';
import { SystemConfigProvider } from './contexts/SystemConfigContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Anwendungsfehler" fallbackMessage="Beim Laden der Anwendung ist ein unerwarteter Fehler aufgetreten.">
      {isFirebaseConfigured ? (
        <SystemConfigProvider>
          <App />
        </SystemConfigProvider>
      ) : (
        <FirebaseConfigError />
      )}
    </ErrorBoundary>
  </React.StrictMode>
);

