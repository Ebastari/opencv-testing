
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const isSecureContextForSW = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
const shouldRegisterServiceWorker = import.meta.env.DEV || import.meta.env.VITE_ENABLE_SW === 'true';
const appCachePrefixes = ['montana-'];

const clearLegacyAppCaches = async () => {
  if (!('caches' in window)) {
    return;
  }

  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => appCachePrefixes.some((prefix) => key.startsWith(prefix)))
      .map((key) => window.caches.delete(key)),
  );
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (shouldRegisterServiceWorker && isSecureContextForSW) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker registration failed:', error);
      });
      return;
    }

    navigator.serviceWorker
      .getRegistrations()
      .then(async (registrations) => {
        await Promise.all(registrations.map((registration) => registration.unregister()));
        await clearLegacyAppCaches();
      })
      .catch((error) => {
        console.error('Service worker cleanup failed:', error);
      });
  });
}
