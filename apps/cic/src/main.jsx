import React from 'react';
import { createRoot } from 'react-dom/client';
// MiCasa Pro type — self-hosted (no CDN, CSP-safe). IBM Plex Sans Arabic covers
// Latin + Arabic; Tajawal is the fallback family.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import App from './App.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(<App />);
