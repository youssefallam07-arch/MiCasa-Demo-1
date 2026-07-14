import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// load the monorepo-root .env regardless of cwd
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

// JWT_SECRET is mandatory and must not be a known placeholder — a guessable
// secret lets anyone forge admin tokens.
const WEAK_SECRETS = new Set(['dev-secret', 'change-me', 'change-me-to-a-long-random-string']);
const secret = process.env.JWT_SECRET;
if (!secret || WEAK_SECRETS.has(secret)) {
  throw new Error('JWT_SECRET is missing or a known-weak placeholder. Set a strong random value in .env — hint: openssl rand -hex 32');
}

export const ENV = {
  // hosted platforms (Render/Railway) inject PORT; locally we use CENTCOM_PORT
  PORT: Number(process.env.PORT || process.env.CENTCOM_PORT || 4000),
  JWT_SECRET: secret,
  JWT_EXPIRES: process.env.JWT_EXPIRES || '12h',
  CORS_ORIGINS: (process.env.CORS_ORIGINS ||
    'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176')
    .split(',').map((s) => s.trim()).filter(Boolean),
};
