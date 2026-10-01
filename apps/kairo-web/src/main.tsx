import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { platform } from "@platform";

const root = document.getElementById('root');
if (root) {
  platform.initialize().finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
}
