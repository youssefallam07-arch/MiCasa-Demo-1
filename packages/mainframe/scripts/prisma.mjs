// Prisma CLI wrapper: defaults DATABASE_URL to the local SQLite file so
// hosted platforms (Render etc.) work with zero env config. A real
// DATABASE_URL in the environment always wins (Postgres later).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

process.env.DATABASE_URL ||= 'file:./dev.db'; // relative to prisma/schema.prisma

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
