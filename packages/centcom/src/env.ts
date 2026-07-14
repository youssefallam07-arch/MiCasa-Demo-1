import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// load the monorepo-root .env regardless of cwd
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

export const ENV = {
  PORT: Number(process.env.CENTCOM_PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '12h',
};
