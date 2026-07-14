// Boot helper: build the frontend apps if their dist/ is missing, so
// `npm start` works even when the host's build step didn't run build:apps.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const apps = ['customer', 'workers', 'cic', 'centcom'];
const missing = apps.filter((a) => !fs.existsSync(`apps/${a}/dist/index.html`));
if (missing.length) {
  console.log('[start] app builds missing (' + missing.join(', ') + ') — running build:apps...');
  execSync('npm run build:apps', { stdio: 'inherit' });
} else {
  console.log('[start] apps already built');
}
