import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A real Postgres/Supabase DATABASE_URL wins (persistent 24/7 data — see
// docs/DEPLOY_SUPABASE.md). Otherwise fall back to the local SQLite file resolved
// to an ABSOLUTE path, so it's the same DB no matter which process imports the
// mainframe (centcom, seed, tests) or what its cwd is.
const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(here, '../prisma/dev.db');
const url = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '')
  ? process.env.DATABASE_URL!
  : `file:${dbFile}`;

export const prisma = new PrismaClient({
  datasources: { db: { url } },
});
