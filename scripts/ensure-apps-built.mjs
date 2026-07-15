// Boot helper: build the frontend apps if their dist/ is missing, so
// `npm start` works even when the host's build step didn't run build:apps.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// only the React admin apps need a build; the customer + worker apps are the
// static single-file MiCasa apps under apps/micasa and apps/micasa-worker.
const apps = ['cic', 'centcom'];
const missing = apps.filter((a) => !fs.existsSync(`apps/${a}/dist/index.html`));
if (missing.length) {
  console.log('[start] app builds missing (' + missing.join(', ') + ') — running build:apps...');
  execSync('npm run build:apps', { stdio: 'inherit' });
} else {
  console.log('[start] apps already built');
}
