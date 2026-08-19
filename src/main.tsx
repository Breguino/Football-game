import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@/ui/tokens/fonts.css';
import '@/ui/tokens/theme.css';
import '@/ui/primitives/primitives.css';
// Last: these are overrides, and have to win over the screen stylesheets.
import '@/ui/tokens/responsive.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
