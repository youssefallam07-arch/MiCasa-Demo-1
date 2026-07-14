import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the SQLite file to an ABSOLUTE path so it's the same DB no matter which
// process imports the mainframe (centcom, seed, tests) or what its cwd is.
const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(here, '../prisma/dev.db');

export const prisma = new PrismaClient({
  datasources: { db: { url: `file:${dbFile}` } },
});
