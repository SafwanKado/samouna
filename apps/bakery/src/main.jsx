import { createRoot } from 'react-dom/client';
import { I18nProvider, ThemeProvider } from '@samouna/shared/react';
import '@samouna/shared/base.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <I18nProvider>
      <App />
    </I18nProvider>
  </ThemeProvider>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
