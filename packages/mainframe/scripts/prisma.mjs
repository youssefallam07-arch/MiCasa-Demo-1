// Prisma CLI wrapper.
//
//   1. Defaults DATABASE_URL to the local SQLite file so a fresh clone / hosted
//      platform works with zero env config.
//   2. Auto-selects the datasource `provider` from the connection string:
//        - postgres:// or postgresql://  -> "postgresql"  (Supabase / any Postgres)
//        - anything else (file:…)         -> "sqlite"
//      Prisma requires `provider` to be a static string in the schema (it can't
//      read env()), so we rewrite the datasource block in place before every
//      generate / db push. This means: set DATABASE_URL to a Supabase connection
//      string (in .env locally, or the Render env) and the whole stack switches
//      to Postgres — no code edits, no schema edits. Leave it unset and it stays
//      on the zero-config SQLite file. See docs/DEPLOY_SUPABASE.md.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

process.env.DATABASE_URL ||= 'file:./dev.db'; // relative to prisma/schema.prisma

const isPostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL);
const provider = isPostgres ? 'postgresql' : 'sqlite';

// Rewrite the datasource block to match the detected provider — but only when it
// actually differs, so a normal SQLite run never touches the file (no churn). A
// pooled Supabase URL (pgbouncer) can't run migrations, so when DIRECT_URL is
// present we wire it up as Prisma's `directUrl` for db push / migrate.
const schemaUrl = new URL('../prisma/schema.prisma', import.meta.url);
const schema = fs.readFileSync(schemaUrl, 'utf8');
const current = (schema.match(/datasource db \{[\s\S]*?\n\}/) || [''])[0];
const curProvider = (current.match(/provider\s*=\s*"([^"]+)"/) || [])[1];
const wantDirect = isPostgres && !!process.env.DIRECT_URL;
const curHasDirect = /directUrl\s*=/.test(current);
if (curProvider !== provider || curHasDirect !== wantDirect) {
  const eol = schema.includes('\r\n') ? '\r\n' : '\n';
  const lines = ['datasource db {', `  provider = "${provider}"`, '  url      = env("DATABASE_URL")'];
  if (wantDirect) lines.push('  directUrl = env("DIRECT_URL")');
  lines.push('}');
  fs.writeFileSync(schemaUrl, schema.replace(/datasource db \{[\s\S]*?\n\}/, lines.join(eol)));
  console.log(`[prisma] datasource provider -> ${provider}`);
}

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
