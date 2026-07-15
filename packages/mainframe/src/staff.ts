// Owner/moderator credential record. ADMIN-role accounts only — passwords the
// OWNER sets, kept in a gitignored, owner-only file (same trust model as
// docs/FIRST_LOGIN.md). Never the database, never git, never regular users
// (their self-chosen passwords are one-way hashed and exposing them is unsafe).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../../docs/STAFF_CREDENTIALS.json');

export type StaffRec = { username: string; name: string; password: string; setAt: string };

function load(): Record<string, StaffRec> {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(map: Record<string, StaffRec>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

export function recordStaffCredential(userId: string, username: string, name: string, password: string) {
  const map = load();
  map[userId] = { username, name, password, setAt: new Date().toISOString() };
  save(map);
}
export function getStaffCredentials(): Record<string, StaffRec> { return load(); }
export function removeStaffCredential(userId: string) { const m = load(); if (m[userId]) { delete m[userId]; save(m); } }
